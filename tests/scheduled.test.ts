/**
 * The scheduled source check.
 *
 * GitHub and the network are faked wholesale: the test asserts on the
 * sequence of actions without sending anything anywhere.
 *
 * The main thing under test: the worker cannot publish a figure. It can only
 * propose one, in a shape that refuses to merge until a person opens the act.
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
 * A fake GitHub: remembers created branches and written files, and answers
 * like the real one on the endpoints the worker uses.
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

    // The Minfin page
    if (url.includes('minfin.gov.by')) {
      return new Response(options.page, { status: options.page === '' ? 503 : 200 });
    }

    // Branches
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

    // Files
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

    // Pull requests
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
    GITHUB_TOKEN: 'ghp_not_a_real_token',
    GITHUB_REPO: 'owner/gold-by',
  };
}

const NOW = new Date('2000-01-11T06:00:00Z');

// ---------------------------------------------------------------------------

describe('the source check', () => {
  it('a first run on a new act opens a PR', async () => {
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

  it('the raw HTML is attached to the PR as evidence', async () => {
    const reports = new FakeKV();
    const page = fixture('current.html');
    const gh = fakeGitHub({ page, tariffs: '[]' });

    await checkMinfin(env(reports), { fetchImpl: gh.fetchImpl, now: NOW });

    const evidence = [...gh.files.entries()].find(([key]) => key.includes('evidence/'));
    expect(evidence).toBeDefined();
    expect(evidence?.[1]).toBe(page);
  });

  it('the proposed record does NOT pass the schema: no dates, and that is the gate', async () => {
    const reports = new FakeKV();
    const gh = fakeGitHub({ page: fixture('current.html'), tariffs: '[]' });

    await checkMinfin(env(reports), { fetchImpl: gh.fetchImpl, now: NOW });

    // What actually landed on the branch, not what sat on main before it.
    const written = [...gh.files.entries()].find(
      ([key]) => key.startsWith('minfin/') && key.endsWith('data/tariffs.json'),
    );
    expect(written).toBeDefined();
    const parsed = JSON.parse(written?.[1] ?? '[]') as unknown;

    const validation = validateTariffFile(parsed);
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    // Exactly the field the source page does not carry.
    expect(validation.issues.some((issue) => issue.path.endsWith('effective_from'))).toBe(true);
  });

  it('the proposed record invents no expiry', async () => {
    const reports = new FakeKV();
    const gh = fakeGitHub({ page: fixture('current.html'), tariffs: '[]' });
    await checkMinfin(env(reports), { fetchImpl: gh.fetchImpl, now: NOW });

    const written = [...gh.files.entries()].find(
      ([key]) => key.startsWith('minfin/') && key.endsWith('data/tariffs.json'),
    );
    const records = JSON.parse(written?.[1] ?? '[]') as { stated_expiry: unknown }[];
    expect(records[0]?.stated_expiry).toBeNull();
  });

  it('the same act a second time does nothing', async () => {
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

  it('a PR about this act is open — no second one is created', async () => {
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

  it('the check stamp is written to KV', async () => {
    const reports = new FakeKV();
    const gh = fakeGitHub({ page: fixture('current.html'), tariffs: '[]' });

    await checkMinfin(env(reports), { fetchImpl: gh.fetchImpl, now: NOW });

    const status = JSON.parse((await reports.get('status:last_check')) ?? '{}') as {
      last_checked: string;
    };
    expect(status.last_checked).toBe('2000-01-11T06:00:00.000Z');
  });
});

describe('parsing failed', () => {
  it('maintenance page: an issue and the block flag', async () => {
    const reports = new FakeKV();
    const gh = fakeGitHub({ page: fixture('maintenance.html') });

    const outcome = await checkMinfin(env(reports), { fetchImpl: gh.fetchImpl, now: NOW });

    expect(outcome).toEqual({ kind: 'parse_failed', reason: 'no_act_line' });
    expect(await reports.get(BLOCK_KEY)).not.toBeNull();
    expect(gh.issues).toHaveLength(1);
    expect(gh.issues[0]?.title).toContain('no_act_line');
  });

  it("archive instead of the current page: also a block, not \'price unchanged\'", async () => {
    const reports = new FakeKV();
    const gh = fakeGitHub({ page: fixture('archive.html') });

    const outcome = await checkMinfin(env(reports), { fetchImpl: gh.fetchImpl, now: NOW });

    expect(outcome).toEqual({ kind: 'parse_failed', reason: 'multiple_acts' });
    expect(await reports.get(BLOCK_KEY)).not.toBeNull();
  });

  it('while the block flag is set nothing is proposed', async () => {
    const reports = new FakeKV();
    await reports.put(BLOCK_KEY, 'parser broke');
    const gh = fakeGitHub({ page: fixture('changed.html'), tariffs: '[]' });

    const outcome = await checkMinfin(env(reports), { fetchImpl: gh.fetchImpl, now: NOW });

    expect(outcome).toEqual({ kind: 'blocked' });
    expect(gh.calls).toHaveLength(0);
  });

  it('the same issue is not filed twice', async () => {
    const reports = new FakeKV();
    const gh = fakeGitHub({ page: fixture('maintenance.html') });

    await checkMinfin(env(reports), { fetchImpl: gh.fetchImpl, now: NOW });
    await reports.delete(BLOCK_KEY);
    await checkMinfin(env(reports), { fetchImpl: gh.fetchImpl, now: NOW });

    expect(gh.issues).toHaveLength(1);
  });

  it('the source did not answer — no issue and no block', async () => {
    const reports = new FakeKV();
    const gh = fakeGitHub({ page: '' }); // answers 503

    const outcome = await checkMinfin(env(reports), { fetchImpl: gh.fetchImpl, now: NOW });

    expect(outcome).toEqual({ kind: 'fetch_failed', status: 503 });
    expect(await reports.get(BLOCK_KEY)).toBeNull();
    expect(gh.issues).toHaveLength(0);
  });

  it('no GitHub token — the worker says plainly it is unconfigured', async () => {
    const reports = new FakeKV();
    const gh = fakeGitHub({ page: fixture('current.html') });

    const outcome = await checkMinfin({ REPORTS: reports }, { fetchImpl: gh.fetchImpl, now: NOW });

    expect(outcome.kind).toBe('not_configured');
  });
});

describe('proposal text', () => {
  const parsed = parseMinfinPage(fixture('current.html'), 'test');

  it('the PR body says it must not be merged as it stands', () => {
    if (!parsed.ok) throw new Error('fixture did not parse');
    const texts = proposalTexts(parsed.act, [], 'https://minfin.gov.by/', '2000-01-11T06:00:00Z');
    expect(texts.body).toContain('must not be merged as it stands');
    expect(texts.body).toContain('effective_from');
    expect(texts.body).toContain('leave `null`');
  });

  it('the PR body lists the parsed prices', () => {
    if (!parsed.ok) throw new Error('fixture did not parse');
    const texts = proposalTexts(parsed.act, [], 'https://minfin.gov.by/', '2000-01-11T06:00:00Z');
    expect(texts.body).toContain('| 585 | 2,50 |');
  });

  it('parser warnings reach the PR body', () => {
    if (!parsed.ok) throw new Error('fixture did not parse');
    const texts = proposalTexts(
      parsed.act,
      [{ kind: 'large_move', message: 'fineness 585: moved +28.0%' }],
      'https://minfin.gov.by/',
      '2000-01-11T06:00:00Z',
    );
    expect(texts.body).toContain('large_move');
    expect(texts.body).toContain('+28.0%');
  });

  it('the branch name is stable for a given act', () => {
    if (!parsed.ok) throw new Error('fixture did not parse');
    expect(branchNameFor(parsed.act)).toBe('minfin/act-TEST-1-2000-01-10');
    expect(branchNameFor(parsed.act)).toBe(branchNameFor(parsed.act));
  });
});

describe('the draft record', () => {
  const parsed = parseMinfinPage(fixture('current.html'), 'test');

  it('both dates are empty, for a person to fill in', () => {
    if (!parsed.ok) throw new Error('fixture did not parse');
    const draft = buildDraft(parsed.act, 'https://minfin.gov.by/', '2000-01-11T06:00:00Z');
    expect(draft.effective_from).toBeNull();
    expect(draft.stated_expiry).toBeNull();
    expect(draft.transcribed_by).toContain('FILL IN');
  });

  it('appends to existing records without overwriting them', () => {
    if (!parsed.ok) throw new Error('fixture did not parse');
    const draft = buildDraft(parsed.act, 'https://minfin.gov.by/', '2000-01-11T06:00:00Z');
    const existing = JSON.stringify([{ act_number: 'TEST-0' }]);
    const merged = JSON.parse(appendDraft(existing, draft)) as { act_number: string }[];
    expect(merged.map((r) => r.act_number)).toEqual(['TEST-0', 'TEST-1']);
  });

  it('a corrupt existing file loses nothing: we start from an empty array', () => {
    if (!parsed.ok) throw new Error('fixture did not parse');
    const draft = buildDraft(parsed.act, 'https://minfin.gov.by/', '2000-01-11T06:00:00Z');
    const merged = JSON.parse(appendDraft('not json', draft)) as unknown[];
    expect(merged).toHaveLength(1);
  });
});

describe('base64 for GitHub', () => {
  it('Cyrillic survives', () => {
    const text = 'Постановление № TEST-1 — цена 1,00 BYN'; // Cyrillic on purpose
    expect(fromBase64(toBase64(text))).toBe(text);
  });

  it('a large HTML round-trips intact', () => {
    const html = fixture('current.html');
    expect(fromBase64(toBase64(html))).toBe(html);
  });
});
