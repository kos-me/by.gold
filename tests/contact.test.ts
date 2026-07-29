/**
 * Accepting an error report: field validation, honeypot, rate, email.
 *
 * The network and the store are faked, so the test sends nothing anywhere and
 * needs no running wrangler.
 */

import { describe, expect, it } from 'vitest';

import {
  extractActNumber,
  formatTicket,
  MAX_NOTE_LENGTH,
  validateReport,
} from '../src/lib/contact.ts';
import { handleContact } from '../worker/src/contact.ts';
import { consume, hashClient, LIMIT_PER_WINDOW } from '../worker/src/ratelimit.ts';
import type { Env } from '../worker/src/env.ts';
import { FakeKV } from './helpers/fake-kv.ts';

const GOOD_NOTE = 'В скупке назвали цену ниже постановления, проверьте пожалуйста';

/** Records every outgoing request and answers per the given script. */
function recorder(
  handlers: Record<string, () => Response> = {},
): { fetchImpl: typeof fetch; calls: { url: string; body: string }[] } {
  const calls: { url: string; body: string }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body =
      typeof init?.body === 'string' ? init.body : init?.body === undefined ? '' : '[form-data]';
    calls.push({ url, body });
    for (const [fragment, handler] of Object.entries(handlers)) {
      if (url.includes(fragment)) return handler();
    }
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function okTurnstile(): Response {
  return new Response(JSON.stringify({ success: true }), { status: 200 });
}

function baseEnv(overrides: Partial<Env> = {}, without: readonly (keyof Env)[] = []): Env {
  const env: Record<string, unknown> = {
    RESEND_API_KEY: 're_test_key_not_real',
    REPORT_TO_EMAIL: 'inbox@example.test',
    REPORT_FROM_EMAIL: 'robot@example.test',
    RATE_LIMIT_SALT: 'соль-для-теста',
    ...overrides,
  };
  for (const key of without) delete env[key];
  return env as Env;
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://gold.by/api/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const deps = (fetchImpl: typeof fetch) => ({
  fetchImpl,
  now: new Date('2000-01-10T12:00:00Z'),
  random: () => 482913,
});

// ---------------------------------------------------------------------------

describe('validateReport', () => {
  it('accepts an ordinary report', () => {
    const result = validateReport({ email: 'a@mail.by', note: GOOD_NOTE });
    expect(result.ok).toBe(true);
  });

  it('rejects an incomplete address', () => {
    const result = validateReport({ email: 'не-почта', note: GOOD_NOTE });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.kind).toBe('email');
  });

  it('rejects too short a description', () => {
    const result = validateReport({ email: 'a@mail.by', note: 'ошибка' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.kind).toBe('note');
  });

  it('rejects too long a description', () => {
    const result = validateReport({ email: 'a@mail.by', note: 'я'.repeat(MAX_NOTE_LENGTH + 1) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.kind).toBe('note');
  });

  it('the honeypot outranks everything else', () => {
    const result = validateReport({ email: 'не-почта', note: 'x', city: 'Минск' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.kind).toBe('honeypot');
  });

  it('trims whitespace', () => {
    const result = validateReport({ email: '  a@mail.by ', note: `  ${GOOD_NOTE}  ` });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.email).toBe('a@mail.by');
  });
});

describe('extractActNumber', () => {
  it('finds the number in various spellings', () => {
    expect(extractActNumber('Постановление № 9999 неверное')).toBe('9999');
    expect(extractActNumber('в акте No 9999 другая цифра')).toBe('9999');
    expect(extractActNumber('постановление 9999 от июля')).toBe('9999');
    expect(extractActNumber('пост. 9999 расходится')).toBe('9999');
    expect(extractActNumber('№9999')).toBe('9999');
    expect(extractActNumber('№ 9999-1')).toBe('9999-1');
  });

  it('invents no number when there is none', () => {
    expect(extractActNumber('У вас цена не та, что в скупке')).toBeNull();
    expect(extractActNumber('')).toBeNull();
  });

  it('does not mistake a stray number for a decree number', () => {
    expect(extractActNumber('мне дали 8,4 грамма вместо 9')).toBeNull();
  });
});

describe('formatTicket', () => {
  it('six digits with a prefix', () => {
    expect(formatTicket(482913)).toBe('GB-482913');
    expect(formatTicket(7)).toBe('GB-000007');
  });

  it('survives large and negative numbers', () => {
    expect(formatTicket(4294967295)).toMatch(/^GB-\d{6}$/);
    expect(formatTicket(-5)).toBe('GB-000005');
  });
});

describe('rate limiting', () => {
  it('the hash depends on the salt; no address is stored in the clear', async () => {
    const a = await hashClient('192.0.2.1', 'соль-один');
    const b = await hashClient('192.0.2.1', 'соль-два');
    expect(a).not.toBe(b);
    expect(a).toHaveLength(32);
    expect(a).not.toContain('192.0.2.1');
  });

  it('allows up to the limit and cuts off beyond it', async () => {
    const kv = new FakeKV();
    const key = await hashClient('192.0.2.1', 'соль');
    for (let i = 0; i < LIMIT_PER_WINDOW; i += 1) {
      expect((await consume(kv, key)).allowed).toBe(true);
    }
    expect((await consume(kv, key)).allowed).toBe(false);
  });

  it('allows again once the window expires', async () => {
    const kv = new FakeKV();
    const key = await hashClient('192.0.2.1', 'соль');
    for (let i = 0; i < LIMIT_PER_WINDOW; i += 1) await consume(kv, key);
    expect((await consume(kv, key)).allowed).toBe(false);
    kv.expire(3601);
    expect((await consume(kv, key)).allowed).toBe(true);
  });

  it('different addresses are counted separately', async () => {
    const kv = new FakeKV();
    const first = await hashClient('192.0.2.1', 'соль');
    const second = await hashClient('192.0.2.2', 'соль');
    for (let i = 0; i < LIMIT_PER_WINDOW; i += 1) await consume(kv, first);
    expect((await consume(kv, first)).allowed).toBe(false);
    expect((await consume(kv, second)).allowed).toBe(true);
  });
});

describe('POST /api/contact', () => {
  it('accepts a report and sends the email', async () => {
    const { fetchImpl, calls } = recorder();
    const response = await handleContact(
      post({ email: 'a@mail.by', note: GOOD_NOTE }),
      baseEnv(),
      deps(fetchImpl),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'accepted', ticket: 'GB-482913' });

    const resend = calls.find((call) => call.url.includes('api.resend.com'));
    expect(resend).toBeDefined();
    expect(resend?.body).toContain(GOOD_NOTE);
    expect(resend?.body).toContain('a@mail.by');
  });

  it('POST only', async () => {
    const response = await handleContact(
      new Request('https://gold.by/api/contact'),
      baseEnv(),
      deps(recorder().fetchImpl),
    );
    expect(response.status).toBe(405);
  });

  it("rejects an incomplete address with the mockup's wording", async () => {
    const { fetchImpl, calls } = recorder();
    const response = await handleContact(
      post({ email: 'не-почта', note: GOOD_NOTE }),
      baseEnv(),
      deps(fetchImpl),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { status: string; message: string };
    expect(body.status).toBe('invalid');
    expect(body.message).toContain('Адрес почты');
    expect(calls.some((call) => call.url.includes('resend'))).toBe(false);
  });

  it("answers a filled honeypot with \'accepted\' but sends no email", async () => {
    const { fetchImpl, calls } = recorder();
    const response = await handleContact(
      post({ email: 'bot@spam.test', note: GOOD_NOTE, city: 'Минск' }),
      baseEnv(),
      deps(fetchImpl),
    );
    expect(response.status).toBe(200);
    expect((await response.json() as { status: string }).status).toBe('accepted');
    expect(calls.some((call) => call.url.includes('resend'))).toBe(false);
  });

  it("a second report about the same act is \'already under review\'", async () => {
    const reports = new FakeKV();
    const { fetchImpl } = recorder();
    const env = baseEnv({ REPORTS: reports });
    const note = 'Постановление № 9999: цифра на главной не совпадает с актом';

    const first = await handleContact(post({ email: 'a@mail.by', note }), env, deps(fetchImpl));
    expect((await first.json() as { status: string }).status).toBe('accepted');

    const second = await handleContact(post({ email: 'b@mail.by', note }), env, deps(fetchImpl));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({
      status: 'duplicate',
      act: '9999',
      since: '2000-01-10',
      count: 2,
    });
  });

  it('a duplicate still arrives by email — no report is lost', async () => {
    const reports = new FakeKV();
    const { fetchImpl, calls } = recorder();
    const env = baseEnv({ REPORTS: reports });
    const note = 'Постановление № 9999: цифра не та';

    await handleContact(post({ email: 'a@mail.by', note }), env, deps(fetchImpl));
    const before = calls.filter((call) => call.url.includes('resend')).length;
    await handleContact(post({ email: 'b@mail.by', note }), env, deps(fetchImpl));
    const after = calls.filter((call) => call.url.includes('resend')).length;

    expect(after).toBe(before + 1);
  });

  it('no text, no email address and no IP reach KV', async () => {
    const reports = new FakeKV();
    const rateLimit = new FakeKV();
    const { fetchImpl } = recorder();
    const env = baseEnv({ REPORTS: reports, RATE_LIMIT: rateLimit });

    await handleContact(
      post(
        { email: 'chelovek@mail.by', note: 'Постановление № 9999: цифра не та' },
        { 'CF-Connecting-IP': '192.0.2.77' },
      ),
      env,
      deps(fetchImpl),
    );

    const everything = JSON.stringify([reports.snapshot(), rateLimit.snapshot()]);
    expect(everything).not.toContain('chelovek@mail.by');
    expect(everything).not.toContain('цифра не та');
    expect(everything).not.toContain('192.0.2.77');
    // Only the per-act counter and the rate counter.
    expect(Object.keys(reports.snapshot())).toEqual(['act:9999']);
    expect(Object.keys(rateLimit.snapshot())[0]).toMatch(/^rl:[0-9a-f]{32}$/);
  });

  it('exceeding the rate gives 429 and no email', async () => {
    const rateLimit = new FakeKV();
    const { fetchImpl, calls } = recorder();
    const env = baseEnv({ RATE_LIMIT: rateLimit });
    const headers = { 'CF-Connecting-IP': '192.0.2.5' };

    for (let i = 0; i < LIMIT_PER_WINDOW; i += 1) {
      const response = await handleContact(
        post({ email: `a${i}@mail.by`, note: GOOD_NOTE }, headers),
        env,
        deps(fetchImpl),
      );
      expect(response.status).toBe(200);
    }

    const sentBefore = calls.filter((call) => call.url.includes('resend')).length;
    const blocked = await handleContact(
      post({ email: 'a@mail.by', note: GOOD_NOTE }, headers),
      env,
      deps(fetchImpl),
    );

    expect(blocked.status).toBe(429);
    expect(calls.filter((call) => call.url.includes('resend'))).toHaveLength(sentBefore);
  });

  it("Resend refused — an honest \'didn't send\', not \'accepted\'", async () => {
    const { fetchImpl } = recorder({
      'api.resend.com': () => new Response('{"message":"nope"}', { status: 422 }),
    });
    const response = await handleContact(
      post({ email: 'a@mail.by', note: GOOD_NOTE }),
      baseEnv(),
      deps(fetchImpl),
    );
    expect(response.status).toBe(502);
    expect((await response.json() as { status: string }).status).toBe('failed');
  });

  it("no Resend key — \'didn't send\', not a quiet success", async () => {
    const { fetchImpl } = recorder();
    const response = await handleContact(
      post({ email: 'a@mail.by', note: GOOD_NOTE }),
      baseEnv({}, ['RESEND_API_KEY']),
      deps(fetchImpl),
    );
    expect(response.status).toBe(502);
  });

  it('in production a report without Turnstile does not pass', async () => {
    const { fetchImpl, calls } = recorder({ 'siteverify': () => okTurnstile() });
    // A fully configured production env: the rate limiter is mandatory there,
    // and its own refusal is asserted separately below.
    const env = baseEnv({
      ENVIRONMENT: 'production',
      TURNSTILE_SECRET_KEY: 'секрет-теста',
      RATE_LIMIT: new FakeKV(),
    });

    const withoutToken = await handleContact(
      post({ email: 'a@mail.by', note: GOOD_NOTE }),
      env,
      deps(fetchImpl),
    );
    expect(withoutToken.status).toBe(400);
    expect(calls.some((call) => call.url.includes('resend'))).toBe(false);

    const withToken = await handleContact(
      post({ email: 'a@mail.by', note: GOOD_NOTE, turnstile: 'токен' }),
      env,
      deps(fetchImpl),
    );
    expect(withToken.status).toBe(200);
  });

  it('in production without the rate-limit KV, the form refuses rather than accepting', async () => {
    /*
     * Missing KV used to mean the rate checks silently did not run — an
     * unlimited form that looked fine. Visibly not working beats quietly
     * accepting, the same rule Turnstile follows.
     */
    const { fetchImpl, calls } = recorder({ 'siteverify': () => okTurnstile() });
    const env = baseEnv({ ENVIRONMENT: 'production', TURNSTILE_SECRET_KEY: 'секрет-теста' });

    const response = await handleContact(
      post({ email: 'a@mail.by', note: GOOD_NOTE, turnstile: 'токен' }),
      env,
      deps(fetchImpl),
    );

    expect(response.status).toBe(503);
    expect((await response.json() as { status: string }).status).toBe('error');
    expect(calls.some((call) => call.url.includes('resend'))).toBe(false);
  });

  it('outside production a missing rate-limit KV is fine — local development', async () => {
    const { fetchImpl } = recorder();
    const response = await handleContact(
      post({ email: 'a@mail.by', note: GOOD_NOTE }),
      baseEnv({}),
      deps(fetchImpl),
    );
    expect(response.status).toBe(200);
  });

  it('in production a Turnstile refusal stops the send', async () => {
    const { fetchImpl, calls } = recorder({
      siteverify: () =>
        new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), {
          status: 200,
        }),
    });
    const response = await handleContact(
      post({ email: 'a@mail.by', note: GOOD_NOTE, turnstile: 'плохой' }),
      baseEnv({ ENVIRONMENT: 'production', TURNSTILE_SECRET_KEY: 'секрет-теста' }),
      deps(fetchImpl),
    );
    expect(response.status).toBe(400);
    expect(calls.some((call) => call.url.includes('resend'))).toBe(false);
  });

  it('a form without JavaScript is accepted too', async () => {
    const { fetchImpl } = recorder();
    const form = new FormData();
    form.append('email', 'a@mail.by');
    form.append('note', GOOD_NOTE);
    const request = new Request('https://gold.by/api/contact', { method: 'POST', body: form });

    const response = await handleContact(request, baseEnv(), deps(fetchImpl));
    expect(response.status).toBe(200);
  });

  it('responses are not cached', async () => {
    const { fetchImpl } = recorder();
    const response = await handleContact(
      post({ email: 'a@mail.by', note: GOOD_NOTE }),
      baseEnv(),
      deps(fetchImpl),
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
