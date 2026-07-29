/**
 * POST /api/contact — сообщение об ошибке в цифре.
 *
 * ЧТО СОХРАНЯЕТСЯ. Ни письмо, ни адрес отправителя нигде не сохраняются:
 * сообщение уходит письмом и живёт только в почте. В KV попадают ровно две
 * вещи, обе — числа:
 *
 *   rl:<хеш адреса>   счётчик частоты, TTL 1 час
 *   act:<номер акта>  счётчик обращений по акту и дата первого, TTL 30 суток
 *
 * Второе нужно для состояния «уже в работе» из макета. Ни текста, ни почты,
 * ни адреса в открытом виде там нет. Если такой счётчик всё равно нежелателен,
 * достаточно убрать вызовы `readActCounter` / `bumpActCounter` — остальное
 * продолжит работать, форма просто всегда будет отвечать «принято».
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

/** Сколько суток помним, что по акту уже писали. */
const ACT_COUNTER_TTL_SECONDS = 30 * 24 * 3600;

export interface ContactDeps {
  /** Подменяется в тестах. */
  readonly fetchImpl?: typeof fetch;
  /** Момент запроса — чтобы дата в ответе была проверяемой. */
  readonly now?: Date;
  /** Источник случайности для номера обращения. */
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
      // Отправка без JavaScript: обычная форма.
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

  // --- 1. Ловушка и проверка полей -----------------------------------------
  const validation = validateReport(payload);
  if (!validation.ok) {
    if (validation.rejection.kind === 'honeypot') {
      // Боту отвечаем как будто всё хорошо: пусть считает, что дошло.
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
      console.warn('turnstile отклонил', result.errorCodes.join(','));
      return json(
        { status: 'invalid', message: 'Проверка не пройдена. Обновите страницу и попробуйте снова.' },
        400,
      );
    }
  } else if (env.TURNSTILE_SECRET_KEY !== undefined) {
    // Вне продакшена проверяем, только если ключ задан: иначе локальная
    // разработка требовала бы настоящего Turnstile.
    const result = await verifyTurnstile(
      payload.turnstile ?? '',
      env.TURNSTILE_SECRET_KEY,
      clientIp,
      fetchImpl,
    );
    if (!result.ok) console.warn('turnstile (не продакшен) отклонил', result.errorCodes.join(','));
  }

  // --- 3. Частота -----------------------------------------------------------
  if (env.RATE_LIMIT !== undefined && clientIp !== null) {
    const salt = requireSecret(env, 'RATE_LIMIT_SALT');
    const verdict = await consume(env.RATE_LIMIT, await hashClient(clientIp, salt));
    if (!verdict.allowed) {
      return json({ status: 'rate_limited' }, 429);
    }
  }

  // --- 4. Уже в работе? -----------------------------------------------------
  const act = extractActNumber(validation.note);
  const today = now.toISOString().slice(0, 10);

  if (act !== null && env.REPORTS !== undefined) {
    const existing = await readActCounter(env.REPORTS, act);
    const updated = await bumpActCounter(env.REPORTS, act, existing, today);

    if (existing !== null) {
      // Письмо всё равно отправляем: обращение не должно потеряться.
      await sendViaResend(env, fetchImpl, {
        ticket: formatTicket(random()),
        email: validation.email,
        note: validation.note,
        act,
      }).catch((error: unknown) => {
        console.error('resend не принял письмо', error);
      });

      return json(
        { status: 'duplicate', act, since: updated.since, count: updated.count },
        200,
      );
    }
  }

  // --- 5. Письмо ------------------------------------------------------------
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
    console.error('resend не настроен или недоступен', error);
    delivered = false;
  }

  if (!delivered) {
    // Честный отказ: у формы есть нарисованное состояние «не отправилось»
    // с почтой для прямого письма, и лучше показать его, чем сказать
    // «принято» о письме, которого не было.
    return json({ status: 'failed' }, 502);
  }

  return json({ status: 'accepted', ticket }, 200);
}
