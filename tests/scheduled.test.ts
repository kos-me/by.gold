/**
 * Проверка источника по расписанию.
 *
 * GitHub и сеть подставлены целиком: тест проверяет последовательность
 * действий, ничего никуда не отправляя.
 *
 * Главное, что здесь проверяется: воркер не может опубликовать цифру.
 * Он может только предложить её так, чтобы предложение не сливалось,
 * пока человек не откроет акт.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { validateTariffFile } from '../src/lib/schema.ts';
import { BLOCK_KEY, checkMinfin } from '../worker/src/scheduled.ts';
import { appendDraft, branchNameFor, buildDraft, proposalTexts } from '../worker/src/proposal.ts';
import { fromBase64, toBase64 } from '../worker/src/github.ts';
import { parseMinfinPage } from '../worker/src/minfin.ts';
import type { Env } from '../worker/src/env.ts';
import { FakeKV } from './helpers/fake-kv.ts';

function fixture(name: string): string {
  return readFileSync(resolve(import.meta.dirname, 'fixtures/minfin', name), 'utf8');
}

interface Call {
  readonly method: string;
  readonly url: string;
  readonly body: unknown;
}

/**
 * Поддельный GitHub: помнит созданные ветки и записанные файлы, отвечает
 * как настоящий на те эндпоинты, которые использует воркер.
 */
function fakeGitHub(options: { page: string; branches?: string[]; tariffs?: string } = { page: '' }) {
  const calls: Call[] = [];
  const branches = new Set(options.branches ?? []);
  const files = new Map<string, string>();
  if (options.tariffs !== undefined) files.set('main:data/tariffs.json', options.tariffs);
  const issues: { title: string }[] = [];

  const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    calls.push({ method, url, body });

    const json = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

    // Страница Минфина
    if (url.includes('minfin.gov.by')) {
      return new Response(options.page, { status: options.page === '' ? 503 : 200 });
    }

    // Ветки
    const refMatch = /\/git\/ref\/heads\/(.+)$/.exec(url);
    if (refMatch !== null && method === 'GET') {
      const name = decodeURIComponent(refMatch[1] as string);
      if (name === 'main') return json({ object: { sha: 'basesha' } });
      return branches.has(name) ? json({ object: { sha: 'x' } }) : json({ message: 'Not Found' }, 404);
    }
    if (url.endsWith('/git/refs') && method === 'POST') {
      const ref = (body as { ref: string }).ref.replace('refs/heads/', '');
      branches.add(ref);
      return json({ ref });
    }

    // Файлы
    const contentsMatch = /\/contents\/([^?]+)(?:\?ref=(.+))?$/.exec(url);
    if (contentsMatch !== null) {
      const path = decodeURIComponent(contentsMatch[1] as string);
      if (method === 'GET') {
        const ref = decodeURIComponent(contentsMatch[2] ?? 'main');
        const stored = files.get(`${ref}:${path}`) ?? files.get(`main:${path}`);
        if (stored === undefined) return json({ message: 'Not Found' }, 404);
        return json({ content: toBase64(stored), sha: `sha-${path}` });
      }
      if (method === 'PUT') {
        const payload = body as { branch: string; content: string };
        files.set(`${payload.branch}:${path}`, fromBase64(payload.content));
        return json({ content: { path } });
      }
    }

    // Issues
    if (url.includes('/issues?state=open')) return json(issues);
    if (url.endsWith('/issues') && method === 'POST') {
      issues.push({ title: (body as { title: string }).title });
      return json({ number: issues.length, html_url: 'https://github.test/issue/1' });
    }

    // PR
    if (url.endsWith('/pulls') && method === 'POST') {
      return json({ number: 7, html_url: 'https://github.test/pr/7' });
    }

    return json({}, 200);
  }) as unknown as typeof fetch;

  return { fetchImpl, calls, branches, files, issues };
}

function env(reports: FakeKV): Env {
  return {
    REPORTS: reports,
    GITHUB_TOKEN: 'ghp_не_настоящий',
    GITHUB_REPO: 'owner/gold-by',
  };
}

const NOW = new Date('2000-01-11T06:00:00Z');

// ---------------------------------------------------------------------------

describe('проверка источника', () => {
  it('первый запуск на новом акте открывает PR', async () => {
    const reports = new FakeKV();
    const gh = fakeGitHub({ page: fixture('current.html'), tariffs: '[]' });

    const outcome = await checkMinfin(env(reports), { fetchImpl: gh.fetchImpl, now: NOW });

    expect(outcome).toEqual({
      kind: 'proposed',
      act: 'TEST-1',
      url: 'https://github.test/pr/7',
    });
    expect(gh.branches.has('minfin/act-TEST-1-2000-01-10')).toBe(true);
  });

  it('к PR приложен сырой HTML как доказательство', async () => {
    const reports = new FakeKV();
    const page = fixture('current.html');
    const gh = fakeGitHub({ page, tariffs: '[]' });

    await checkMinfin(env(reports), { fetchImpl: gh.fetchImpl, now: NOW });

    const evidence = [...gh.files.entries()].find(([key]) => key.includes('evidence/'));
    expect(evidence).toBeDefined();
    expect(evidence?.[1]).toBe(page);
  });

  it('предложенная запись НЕ проходит схему: дат нет, и это шлагбаум', async () => {
    const reports = new FakeKV();
    const gh = fakeGitHub({ page: fixture('current.html'), tariffs: '[]' });

    await checkMinfin(env(reports), { fetchImpl: gh.fetchImpl, now: NOW });

    // Именно то, что легло в ветку, а не то, что лежало в main до неё.
    const written = [...gh.files.entries()].find(
      ([key]) => key.startsWith('minfin/') && key.endsWith('data/tariffs.json'),
    );
    expect(written).toBeDefined();
    const parsed = JSON.parse(written?.[1] ?? '[]') as unknown;

    const validation = validateTariffFile(parsed);
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    // Ровно то поле, которого нет на странице источника.
    expect(validation.issues.some((issue) => issue.path.endsWith('effective_from'))).toBe(true);
  });

  it('в предложенной записи срок не выдуман', async () => {
    const reports = new FakeKV();
    const gh = fakeGitHub({ page: fixture('current.html'), tariffs: '[]' });
    await checkMinfin(env(reports), { fetchImpl: gh.fetchImpl, now: NOW });

    const written = [...gh.files.entries()].find(
      ([key]) => key.startsWith('minfin/') && key.endsWith('data/tariffs.json'),
    );
    const records = JSON.parse(written?.[1] ?? '[]') as { stated_expiry: unknown }[];
    expect(records[0]?.stated_expiry).toBeNull();
  });

  it('тот же акт второй раз — ничего не делает', async () => {
    const reports = new FakeKV();
    await reports.put(
      'minfin:last_act',
      JSON.stringify({ act_number: 'TEST-1', act_date: '2000-01-10' }),
    );
    const gh = fakeGitHub({ page: fixture('current.html'), tariffs: '[]' });

    const outcome = await checkMinfin(env(reports), { fetchImpl: gh.fetchImpl, now: NOW });

    expect(outcome).toEqual({ kind: 'unchanged', act: 'TEST-1' });
    expect(gh.calls.some((call) => call.url.endsWith('/pulls'))).toBe(false);
  });

  it('PR об этом акте уже открыт — второй не заводится', async () => {
    const reports = new FakeKV();
    const gh = fakeGitHub({
      page: fixture('current.html'),
      branches: ['minfin/act-TEST-1-2000-01-10'],
      tariffs: '[]',
    });

    const outcome = await checkMinfin(env(reports), { fetchImpl: gh.fetchImpl, now: NOW });

    expect(outcome).toEqual({ kind: 'proposal_exists', act: 'TEST-1' });
    expect(gh.calls.some((call) => call.url.endsWith('/pulls'))).toBe(false);
  });

  it('отметка о проверке пишется в KV', async () => {
    const reports = new FakeKV();
    const gh = fakeGitHub({ page: fixture('current.html'), tariffs: '[]' });

    await checkMinfin(env(reports), { fetchImpl: gh.fetchImpl, now: NOW });

    const status = JSON.parse((await reports.get('status:last_check')) ?? '{}') as {
      last_checked: string;
    };
    expect(status.last_checked).toBe('2000-01-11T06:00:00.000Z');
  });
});

describe('разбор не удался', () => {
  it('страница техобслуживания: issue и флаг блокировки', async () => {
    const reports = new FakeKV();
    const gh = fakeGitHub({ page: fixture('maintenance.html') });

    const outcome = await checkMinfin(env(reports), { fetchImpl: gh.fetchImpl, now: NOW });

    expect(outcome).toEqual({ kind: 'parse_failed', reason: 'no_act_line' });
    expect(await reports.get(BLOCK_KEY)).not.toBeNull();
    expect(gh.issues).toHaveLength(1);
    expect(gh.issues[0]?.title).toContain('no_act_line');
  });

  it('архив вместо текущей страницы: тоже блокировка, а не «цена не изменилась»', async () => {
    const reports = new FakeKV();
    const gh = fakeGitHub({ page: fixture('archive.html') });

    const outcome = await checkMinfin(env(reports), { fetchImpl: gh.fetchImpl, now: NOW });

    expect(outcome).toEqual({ kind: 'parse_failed', reason: 'multiple_acts' });
    expect(await reports.get(BLOCK_KEY)).not.toBeNull();
  });

  it('пока стоит флаг блокировки, ничего не предлагается', async () => {
    const reports = new FakeKV();
    await reports.put(BLOCK_KEY, 'парсер сломался');
    const gh = fakeGitHub({ page: fixture('changed.html'), tariffs: '[]' });

    const outcome = await checkMinfin(env(reports), { fetchImpl: gh.fetchImpl, now: NOW });

    expect(outcome).toEqual({ kind: 'blocked' });
    expect(gh.calls).toHaveLength(0);
  });

  it('одно и то же issue не заводится дважды', async () => {
    const reports = new FakeKV();
    const gh = fakeGitHub({ page: fixture('maintenance.html') });

    await checkMinfin(env(reports), { fetchImpl: gh.fetchImpl, now: NOW });
    await reports.delete(BLOCK_KEY);
    await checkMinfin(env(reports), { fetchImpl: gh.fetchImpl, now: NOW });

    expect(gh.issues).toHaveLength(1);
  });

  it('источник не ответил — ни issue, ни блокировки', async () => {
    const reports = new FakeKV();
    const gh = fakeGitHub({ page: '' }); // отдаёт 503

    const outcome = await checkMinfin(env(reports), { fetchImpl: gh.fetchImpl, now: NOW });

    expect(outcome).toEqual({ kind: 'fetch_failed', status: 503 });
    expect(await reports.get(BLOCK_KEY)).toBeNull();
    expect(gh.issues).toHaveLength(0);
  });

  it('нет токена GitHub — воркер честно говорит, что не настроен', async () => {
    const reports = new FakeKV();
    const gh = fakeGitHub({ page: fixture('current.html') });

    const outcome = await checkMinfin({ REPORTS: reports }, { fetchImpl: gh.fetchImpl, now: NOW });

    expect(outcome.kind).toBe('not_configured');
  });
});

describe('тексты предложения', () => {
  const parsed = parseMinfinPage(fixture('current.html'), 'test');

  it('в теле PR сказано, что его нельзя слить как есть', () => {
    if (!parsed.ok) throw new Error('фикстура не разобралась');
    const texts = proposalTexts(parsed.act, [], 'https://minfin.gov.by/', '2000-01-11T06:00:00Z');
    expect(texts.body).toContain('нельзя слить как есть');
    expect(texts.body).toContain('effective_from');
    expect(texts.body).toContain('оставить `null`');
  });

  it('в теле PR перечислены разобранные цены', () => {
    if (!parsed.ok) throw new Error('фикстура не разобралась');
    const texts = proposalTexts(parsed.act, [], 'https://minfin.gov.by/', '2000-01-11T06:00:00Z');
    expect(texts.body).toContain('| 585 | 2,50 |');
  });

  it('предупреждения парсера попадают в тело PR', () => {
    if (!parsed.ok) throw new Error('фикстура не разобралась');
    const texts = proposalTexts(
      parsed.act,
      [{ kind: 'large_move', message: 'проба 585: изменение +28,0%' }],
      'https://minfin.gov.by/',
      '2000-01-11T06:00:00Z',
    );
    expect(texts.body).toContain('large_move');
    expect(texts.body).toContain('+28,0%');
  });

  it('имя ветки одно и то же для одного акта', () => {
    if (!parsed.ok) throw new Error('фикстура не разобралась');
    expect(branchNameFor(parsed.act)).toBe('minfin/act-TEST-1-2000-01-10');
    expect(branchNameFor(parsed.act)).toBe(branchNameFor(parsed.act));
  });
});

describe('черновик записи', () => {
  const parsed = parseMinfinPage(fixture('current.html'), 'test');

  it('обе даты пустые, заполнять их человеку', () => {
    if (!parsed.ok) throw new Error('фикстура не разобралась');
    const draft = buildDraft(parsed.act, 'https://minfin.gov.by/', '2000-01-11T06:00:00Z');
    expect(draft.effective_from).toBeNull();
    expect(draft.stated_expiry).toBeNull();
    expect(draft.transcribed_by).toContain('ЗАПОЛНИТЕ');
  });

  it('дописывается к существующим записям, не затирая их', () => {
    if (!parsed.ok) throw new Error('фикстура не разобралась');
    const draft = buildDraft(parsed.act, 'https://minfin.gov.by/', '2000-01-11T06:00:00Z');
    const existing = JSON.stringify([{ act_number: 'TEST-0' }]);
    const merged = JSON.parse(appendDraft(existing, draft)) as { act_number: string }[];
    expect(merged.map((r) => r.act_number)).toEqual(['TEST-0', 'TEST-1']);
  });

  it('битый существующий файл не приводит к потере: начинаем с пустого массива', () => {
    if (!parsed.ok) throw new Error('фикстура не разобралась');
    const draft = buildDraft(parsed.act, 'https://minfin.gov.by/', '2000-01-11T06:00:00Z');
    const merged = JSON.parse(appendDraft('не json', draft)) as unknown[];
    expect(merged).toHaveLength(1);
  });
});

describe('base64 для GitHub', () => {
  it('кириллица не ломается', () => {
    const text = 'Постановление № 41 — цена 202,18 BYN';
    expect(fromBase64(toBase64(text))).toBe(text);
  });

  it('большой HTML переживает круг', () => {
    const html = fixture('current.html');
    expect(fromBase64(toBase64(html))).toBe(html);
  });
});
