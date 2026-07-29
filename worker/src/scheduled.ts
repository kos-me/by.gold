/**
 * The scheduled source check.
 *
 * The run: fetch the page → parse → compare against the last known record →
 * if the act is new, open a pull request with a draft and the raw HTML as
 * evidence. If parsing failed, file an issue and set the block flag.
 *
 * The worker publishes nothing, ever. The only thing it writes outside GitHub
 * is the check timestamp in KV, so the site's footer can say honestly when the
 * source was last looked at.
 */

import { MINFIN_URL } from '../../src/lib/site.ts';
import { validateTariffFile, type TariffRecord } from '../../src/lib/schema.ts';
import { GitHub } from './github.ts';
import { checkPriceMoves, isNewAct, parseMinfinPage } from './minfin.ts';
import {
  appendDraft,
  branchNameFor,
  buildDraft,
  failureIssueTexts,
  proposalTexts,
} from './proposal.ts';
import { requireSecret, type Env } from './env.ts';

/** While this flag is set the worker proposes nothing. Cleared by hand. */
export const BLOCK_KEY = 'block:publish';
const STATUS_KEY = 'status:last_check';
const LAST_ACT_KEY = 'minfin:last_act';

export interface ScheduledDeps {
  readonly fetchImpl?: typeof fetch;
  readonly now?: Date;
}

export type ScheduledOutcome =
  | { readonly kind: 'blocked' }
  | { readonly kind: 'unchanged'; readonly act: string }
  | { readonly kind: 'fetch_failed'; readonly status: number }
  | { readonly kind: 'parse_failed'; readonly reason: string }
  | { readonly kind: 'proposed'; readonly act: string; readonly url: string }
  | { readonly kind: 'proposal_exists'; readonly act: string }
  | { readonly kind: 'not_configured'; readonly detail: string };

const UA = 'gold-by-watcher (+https://gold.by/o-proekte)';

async function knownAct(env: Env): Promise<{ act_number: string; act_date: string } | null> {
  const raw = (await env.REPORTS?.get(LAST_ACT_KEY)) ?? null;
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as { act_number?: string; act_date?: string };
    if (typeof parsed.act_number !== 'string' || typeof parsed.act_date !== 'string') return null;
    return { act_number: parsed.act_number, act_date: parsed.act_date };
  } catch {
    return null;
  }
}

/**
 * The last known record from the repository — needed to compare prices and
 * notice a large move. Read through GitHub rather than from the build: the
 * worker outlives any particular build of the site.
 */
async function latestRecord(github: GitHub): Promise<TariffRecord | null> {
  const file = await github.readFile('data/tariffs.json', 'main').catch(() => null);
  if (file === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(file.text);
  } catch {
    return null;
  }
  const result = validateTariffFile(parsed);
  if (!result.ok || result.value.length === 0) return null;
  return [...result.value].sort((a, b) => (a.effective_from < b.effective_from ? -1 : 1)).at(-1) ?? null;
}

export async function checkMinfin(env: Env, deps: ScheduledDeps = {}): Promise<ScheduledOutcome> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? new Date();
  const checkedAt = now.toISOString();

  if ((await env.REPORTS?.get(BLOCK_KEY)) !== null && env.REPORTS !== undefined) {
    return { kind: 'blocked' };
  }

  // --- fetch -----------------------------------------------------------------
  let html: string;
  try {
    const response = await fetchImpl(MINFIN_URL, { headers: { 'user-agent': UA } });
    if (!response.ok) return { kind: 'fetch_failed', status: response.status };
    html = await response.text();
  } catch {
    return { kind: 'fetch_failed', status: 0 };
  }

  // The check stamp is written regardless of the parse outcome: the page
  // really was looked at, and the site's footer is entitled to say so.
  await env.REPORTS?.put(
    STATUS_KEY,
    JSON.stringify({ last_checked: checkedAt, last_checked_source: MINFIN_URL }),
  );

  // --- parse ------------------------------------------------------------------
  const parseResult = parseMinfinPage(html, MINFIN_URL);

  let token: string;
  let repo: string;
  try {
    token = requireSecret(env, 'GITHUB_TOKEN');
    repo = requireSecret(env, 'GITHUB_REPO');
  } catch (error) {
    return { kind: 'not_configured', detail: String(error) };
  }
  const github = new GitHub({ token, repo, fetchImpl });

  if (!parseResult.ok) {
    // Block publication: changed markup is more dangerous than missing data,
    // because the parser may start reading the wrong table.
    await env.REPORTS?.put(BLOCK_KEY, `${checkedAt}: ${parseResult.reason}`);
    const issue = failureIssueTexts(parseResult.reason, parseResult.detail, MINFIN_URL, checkedAt);
    if (!(await github.hasOpenIssue(issue.title))) {
      await github.openIssue(issue.title, issue.body, ['parser']);
    }
    return { kind: 'parse_failed', reason: parseResult.reason };
  }

  const { act, warnings } = parseResult;

  // --- has anything changed? --------------------------------------------------
  const previous = await knownAct(env);
  if (!isNewAct(act, previous)) {
    return { kind: 'unchanged', act: act.act_number };
  }

  const branch = branchNameFor(act);
  if (await github.branchExists(branch)) {
    // A PR about this act is already open. No reason to open a second.
    return { kind: 'proposal_exists', act: act.act_number };
  }

  // --- propose -----------------------------------------------------------------
  const latest = await latestRecord(github);
  const moves = checkPriceMoves(act.prices_byn_per_gram, latest?.prices_byn_per_gram ?? null);
  const allWarnings = [...warnings, ...moves];

  await github.createBranch(branch);

  const texts = proposalTexts(act, allWarnings, MINFIN_URL, checkedAt);
  const draft = buildDraft(act, MINFIN_URL, checkedAt);

  const current = await github.readFile('data/tariffs.json', branch);
  await github.writeFile(
    'data/tariffs.json',
    branch,
    appendDraft(current?.text ?? '[]', draft),
    texts.commitMessage,
    current?.sha,
  );

  // Raw HTML beside the record is evidence, not a data source.
  await github.writeFile(
    texts.evidencePath,
    branch,
    html,
    `Evidence: the Minfin page as of ${checkedAt}`,
  );

  const pr = await github.openPullRequest(branch, texts.title, texts.body);

  await env.REPORTS?.put(
    LAST_ACT_KEY,
    JSON.stringify({ act_number: act.act_number, act_date: act.act_date }),
  );

  return { kind: 'proposed', act: act.act_number, url: pr.html_url };
}

export async function runScheduled(
  event: { readonly cron: string },
  env: Env,
  deps: ScheduledDeps = {},
): Promise<ScheduledOutcome> {
  const outcome = await checkMinfin(env, deps);
  console.log(`cron ${event.cron}: ${JSON.stringify(outcome)}`);
  return outcome;
}
