/**
 * POST /api/contact — a report of an error in a figure.
 *
 * WHAT IS STORED. Neither the message nor the sender's address is stored
 * anywhere: the report leaves as an email and lives only in the mailbox. KV
 * receives exactly two things, both numbers:
 *
 *   rl:<address hash>  rate counter, TTL 1 hour
 *   act:<decree no.>   report count for that decree and the date of the
 *                      first one, TTL 30 days
 *
 * The second exists for the mockup's "already under review" state. It holds
 * no text, no email address and no IP in the clear. If the counter is
 * unwanted anyway, drop the `readActCounter` / `bumpActCounter` calls — the
 * rest keeps working and the form simply always answers "accepted".
 */

import {
  extractActNumber,
  formatTicket,
  validateReport,
  type ReportInput,
} from '../../src/lib/contact.ts';
import { isProduction, requireSecret, type Env, type KVLike } from './env.ts';
import { consume, hashClient } from './ratelimit.ts';
import { verifyTurnstile } from './turnstile.ts';

/** How many days we remember that someone already wrote about this decree. */
const ACT_COUNTER_TTL_SECONDS = 30 * 24 * 3600;

export interface ContactDeps {
  /** Swapped out in tests. */
  readonly fetchImpl?: typeof fetch;
  /** The request instant, so the date in the response is testable. */
  readonly now?: Date;
  /** Randomness source for the ticket number. */
  readonly random?: () => number;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

interface ActCounter {
  readonly count: number;
  readonly since: string;
}

async function readActCounter(kv: KVLike, act: string): Promise<ActCounter | null> {
  const raw = await kv.get(`act:${act}`);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ActCounter>;
    if (typeof parsed.count !== 'number' || typeof parsed.since !== 'string') return null;
    return { count: parsed.count, since: parsed.since };
  } catch {
    return null;
  }
}

async function bumpActCounter(
  kv: KVLike,
  act: string,
  existing: ActCounter | null,
  today: string,
): Promise<ActCounter> {
  const next: ActCounter = {
    count: (existing?.count ?? 0) + 1,
    since: existing?.since ?? today,
  };
  await kv.put(`act:${act}`, JSON.stringify(next), { expirationTtl: ACT_COUNTER_TTL_SECONDS });
  return next;
}

async function sendViaResend(
  env: Env,
  fetchImpl: typeof fetch,
  message: { ticket: string; email: string; note: string; act: string | null },
): Promise<boolean> {
  const apiKey = requireSecret(env, 'RESEND_API_KEY');
  const to = requireSecret(env, 'REPORT_TO_EMAIL');
  const from = requireSecret(env, 'REPORT_FROM_EMAIL');

  const subject =
    message.act === null
      ? `${message.ticket} — сообщение об ошибке`
      : `${message.ticket} — постановление № ${message.act}`;

  const text = [
    `Обращение: ${message.ticket}`,
    message.act === null ? 'Номер акта в тексте не найден.' : `Акт в тексте: № ${message.act}`,
    `Ответить: ${message.email}`,
    '',
    message.note,
  ].join('\n');

  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      reply_to: message.email,
    }),
  });

  return response.ok;
}

export async function handleContact(
  request: Request,
  env: Env,
  deps: ContactDeps = {},
): Promise<Response> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? new Date();
  const random = deps.random ?? (() => crypto.getRandomValues(new Uint32Array(1))[0] ?? 0);

  if (request.method !== 'POST') {
    return json({ status: 'method_not_allowed' }, 405);
  }

  let payload: Partial<ReportInput>;
  try {
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      payload = (await request.json()) as Partial<ReportInput>;
    } else {
      // Submission without JavaScript: an ordinary form post.
      const form = await request.formData();
      payload = {
        email: String(form.get('email') ?? ''),
        note: String(form.get('note') ?? ''),
        city: String(form.get('city') ?? ''),
        turnstile: String(form.get('cf-turnstile-response') ?? ''),
      };
    }
  } catch {
    return json({ status: 'invalid', message: 'Тело запроса не разобрано.' }, 400);
  }

  // --- 1. Honeypot and field validation ------------------------------------
  const validation = validateReport(payload);
  if (!validation.ok) {
    if (validation.rejection.kind === 'honeypot') {
      // Answer a bot as if all is well: let it believe the message landed.
      return json({ status: 'accepted', ticket: formatTicket(random()) }, 200);
    }
    return json({ status: 'invalid', message: validation.rejection.message }, 400);
  }

  const clientIp = request.headers.get('CF-Connecting-IP');

  // --- 2. Turnstile ---------------------------------------------------------
  if (isProduction(env)) {
    const secret = requireSecret(env, 'TURNSTILE_SECRET_KEY');
    const result = await verifyTurnstile(
      payload.turnstile ?? '',
      secret,
      clientIp,
      fetchImpl,
    );
    if (!result.ok) {
      console.warn('turnstile rejected', result.errorCodes.join(','));
      return json(
        { status: 'invalid', message: 'Проверка не пройдена. Обновите страницу и попробуйте снова.' },
        400,
      );
    }
  } else if (env.TURNSTILE_SECRET_KEY !== undefined) {
    // Outside production we verify only when a key is set: otherwise local
    // development would require a real Turnstile.
    const result = await verifyTurnstile(
      payload.turnstile ?? '',
      env.TURNSTILE_SECRET_KEY,
      clientIp,
      fetchImpl,
    );
    if (!result.ok) console.warn('turnstile (non-production) rejected', result.errorCodes.join(','));
  }

  // --- 3. Rate ---------------------------------------------------------------
  /*
   * In production the rate limiter is not optional. Without the KV binding the
   * checks below simply do not run, and a silently unlimited form is the kind
   * of half-working deployment this project refuses elsewhere. Refuse loudly
   * instead: the visitor is told it did not send and offered the alternative,
   * exactly as when Turnstile is unconfigured.
   */
  if (isProduction(env) && env.RATE_LIMIT === undefined) {
    console.error('RATE_LIMIT KV binding missing in production — refusing the submission');
    return json(
      {
        status: 'error',
        message: 'Форма сейчас не работает. Напишите нам через пробирный надзор или попробуйте позже.',
      },
      503,
    );
  }

  if (env.RATE_LIMIT !== undefined && clientIp !== null) {
    const salt = requireSecret(env, 'RATE_LIMIT_SALT');
    const verdict = await consume(env.RATE_LIMIT, await hashClient(clientIp, salt));
    if (!verdict.allowed) {
      return json({ status: 'rate_limited' }, 429);
    }
  }

  // --- 4. Already under review? ----------------------------------------------
  const act = extractActNumber(validation.note);
  const today = now.toISOString().slice(0, 10);

  if (act !== null && env.REPORTS !== undefined) {
    const existing = await readActCounter(env.REPORTS, act);
    const updated = await bumpActCounter(env.REPORTS, act, existing, today);

    if (existing !== null) {
      // Send the email regardless: a report must never be lost.
      await sendViaResend(env, fetchImpl, {
        ticket: formatTicket(random()),
        email: validation.email,
        note: validation.note,
        act,
      }).catch((error: unknown) => {
        console.error('resend refused the email', error);
      });

      return json(
        { status: 'duplicate', act, since: updated.since, count: updated.count },
        200,
      );
    }
  }

  // --- 5. Email --------------------------------------------------------------
  const ticket = formatTicket(random());
  let delivered = false;
  try {
    delivered = await sendViaResend(env, fetchImpl, {
      ticket,
      email: validation.email,
      note: validation.note,
      act,
    });
  } catch (error) {
    console.error('resend is unconfigured or unreachable', error);
    delivered = false;
  }

  if (!delivered) {
    // An honest refusal: the form has a designed "didn't send" state with a
    // direct email address, and showing that beats claiming "accepted" about
    // an email that never existed.
    return json({ status: 'failed' }, 502);
  }

  return json({ status: 'accepted', ticket }, 200);
}
