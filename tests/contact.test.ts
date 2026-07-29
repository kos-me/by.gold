/**
 * Приём сообщения об ошибке: проверка полей, ловушка, частота, письмо.
 *
 * Сеть и хранилище подставлены, поэтому тест ничего никуда не отправляет
 * и не требует запущенного wrangler.
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

/** Записывает все исходящие запросы и отвечает по заданному сценарию. */
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
  it('принимает нормальное сообщение', () => {
    const result = validateReport({ email: 'a@mail.by', note: GOOD_NOTE });
    expect(result.ok).toBe(true);
  });

  it('отвергает неполный адрес', () => {
    const result = validateReport({ email: 'не-почта', note: GOOD_NOTE });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.kind).toBe('email');
  });

  it('отвергает слишком короткое описание', () => {
    const result = validateReport({ email: 'a@mail.by', note: 'ошибка' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.kind).toBe('note');
  });

  it('отвергает слишком длинное описание', () => {
    const result = validateReport({ email: 'a@mail.by', note: 'я'.repeat(MAX_NOTE_LENGTH + 1) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.kind).toBe('note');
  });

  it('ловушка важнее всего остального', () => {
    const result = validateReport({ email: 'не-почта', note: 'x', city: 'Минск' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.kind).toBe('honeypot');
  });

  it('обрезает пробелы', () => {
    const result = validateReport({ email: '  a@mail.by ', note: `  ${GOOD_NOTE}  ` });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.email).toBe('a@mail.by');
  });
});

describe('extractActNumber', () => {
  it('находит номер в разных написаниях', () => {
    expect(extractActNumber('Постановление № 41 неверное')).toBe('41');
    expect(extractActNumber('в акте No 41 другая цифра')).toBe('41');
    expect(extractActNumber('постановление 41 от июля')).toBe('41');
    expect(extractActNumber('пост. 41 расходится')).toBe('41');
    expect(extractActNumber('№41')).toBe('41');
    expect(extractActNumber('№ 41-1')).toBe('41-1');
  });

  it('не выдумывает номер, если его нет', () => {
    expect(extractActNumber('У вас цена не та, что в скупке')).toBeNull();
    expect(extractActNumber('')).toBeNull();
  });

  it('не принимает случайное число за номер акта', () => {
    expect(extractActNumber('мне дали 8,4 грамма вместо 9')).toBeNull();
  });
});

describe('formatTicket', () => {
  it('шесть цифр с префиксом', () => {
    expect(formatTicket(482913)).toBe('GB-482913');
    expect(formatTicket(7)).toBe('GB-000007');
  });

  it('не ломается на больших и отрицательных числах', () => {
    expect(formatTicket(4294967295)).toMatch(/^GB-\d{6}$/);
    expect(formatTicket(-5)).toBe('GB-000005');
  });
});

describe('ограничение частоты', () => {
  it('хеш зависит от соли, адрес в открытом виде не сохраняется', async () => {
    const a = await hashClient('192.0.2.1', 'соль-один');
    const b = await hashClient('192.0.2.1', 'соль-два');
    expect(a).not.toBe(b);
    expect(a).toHaveLength(32);
    expect(a).not.toContain('192.0.2.1');
  });

  it('пропускает до лимита и отсекает дальше', async () => {
    const kv = new FakeKV();
    const key = await hashClient('192.0.2.1', 'соль');
    for (let i = 0; i < LIMIT_PER_WINDOW; i += 1) {
      expect((await consume(kv, key)).allowed).toBe(true);
    }
    expect((await consume(kv, key)).allowed).toBe(false);
  });

  it('после истечения окна снова пропускает', async () => {
    const kv = new FakeKV();
    const key = await hashClient('192.0.2.1', 'соль');
    for (let i = 0; i < LIMIT_PER_WINDOW; i += 1) await consume(kv, key);
    expect((await consume(kv, key)).allowed).toBe(false);
    kv.expire(3601);
    expect((await consume(kv, key)).allowed).toBe(true);
  });

  it('разные адреса считаются отдельно', async () => {
    const kv = new FakeKV();
    const first = await hashClient('192.0.2.1', 'соль');
    const second = await hashClient('192.0.2.2', 'соль');
    for (let i = 0; i < LIMIT_PER_WINDOW; i += 1) await consume(kv, first);
    expect((await consume(kv, first)).allowed).toBe(false);
    expect((await consume(kv, second)).allowed).toBe(true);
  });
});

describe('POST /api/contact', () => {
  it('принимает сообщение и отправляет письмо', async () => {
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

  it('только POST', async () => {
    const response = await handleContact(
      new Request('https://gold.by/api/contact'),
      baseEnv(),
      deps(recorder().fetchImpl),
    );
    expect(response.status).toBe(405);
  });

  it('отвергает неполный адрес с формулировкой из макета', async () => {
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

  it('на заполненную ловушку отвечает «принято», но письма не шлёт', async () => {
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

  it('второе сообщение по тому же акту — «уже в работе»', async () => {
    const reports = new FakeKV();
    const { fetchImpl } = recorder();
    const env = baseEnv({ REPORTS: reports });
    const note = 'Постановление № 41: цифра на главной не совпадает с актом';

    const first = await handleContact(post({ email: 'a@mail.by', note }), env, deps(fetchImpl));
    expect((await first.json() as { status: string }).status).toBe('accepted');

    const second = await handleContact(post({ email: 'b@mail.by', note }), env, deps(fetchImpl));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({
      status: 'duplicate',
      act: '41',
      since: '2000-01-10',
      count: 2,
    });
  });

  it('дубликат всё равно доходит письмом — обращение не теряется', async () => {
    const reports = new FakeKV();
    const { fetchImpl, calls } = recorder();
    const env = baseEnv({ REPORTS: reports });
    const note = 'Постановление № 41: цифра не та';

    await handleContact(post({ email: 'a@mail.by', note }), env, deps(fetchImpl));
    const before = calls.filter((call) => call.url.includes('resend')).length;
    await handleContact(post({ email: 'b@mail.by', note }), env, deps(fetchImpl));
    const after = calls.filter((call) => call.url.includes('resend')).length;

    expect(after).toBe(before + 1);
  });

  it('в KV не попадает ни текста, ни почты, ни адреса', async () => {
    const reports = new FakeKV();
    const rateLimit = new FakeKV();
    const { fetchImpl } = recorder();
    const env = baseEnv({ REPORTS: reports, RATE_LIMIT: rateLimit });

    await handleContact(
      post(
        { email: 'chelovek@mail.by', note: 'Постановление № 41: цифра не та' },
        { 'CF-Connecting-IP': '192.0.2.77' },
      ),
      env,
      deps(fetchImpl),
    );

    const everything = JSON.stringify([reports.snapshot(), rateLimit.snapshot()]);
    expect(everything).not.toContain('chelovek@mail.by');
    expect(everything).not.toContain('цифра не та');
    expect(everything).not.toContain('192.0.2.77');
    // Только счётчик по акту и счётчик частоты.
    expect(Object.keys(reports.snapshot())).toEqual(['act:41']);
    expect(Object.keys(rateLimit.snapshot())[0]).toMatch(/^rl:[0-9a-f]{32}$/);
  });

  it('превышение частоты — 429 и никакого письма', async () => {
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

  it('Resend не принял — честное «не отправилось», а не «принято»', async () => {
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

  it('нет ключа Resend — «не отправилось», а не тихий успех', async () => {
    const { fetchImpl } = recorder();
    const response = await handleContact(
      post({ email: 'a@mail.by', note: GOOD_NOTE }),
      baseEnv({}, ['RESEND_API_KEY']),
      deps(fetchImpl),
    );
    expect(response.status).toBe(502);
  });

  it('в продакшене без Turnstile сообщение не проходит', async () => {
    const { fetchImpl, calls } = recorder({ 'siteverify': () => okTurnstile() });
    const env = baseEnv({ ENVIRONMENT: 'production', TURNSTILE_SECRET_KEY: 'секрет-теста' });

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

  it('в продакшене отказ Turnstile останавливает отправку', async () => {
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

  it('форма без JavaScript тоже принимается', async () => {
    const { fetchImpl } = recorder();
    const form = new FormData();
    form.append('email', 'a@mail.by');
    form.append('note', GOOD_NOTE);
    const request = new Request('https://gold.by/api/contact', { method: 'POST', body: form });

    const response = await handleContact(request, baseEnv(), deps(fetchImpl));
    expect(response.status).toBe(200);
  });

  it('ответы не кэшируются', async () => {
    const { fetchImpl } = recorder();
    const response = await handleContact(
      post({ email: 'a@mail.by', note: GOOD_NOTE }),
      baseEnv(),
      deps(fetchImpl),
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
