/**
 * Проверка источника по расписанию.
 *
 * Ход: скачать страницу → разобрать → сравнить с последней известной записью
 * → если акт новый, открыть PR с черновиком и сырым HTML как доказательством.
 * Разбор не удался — завести issue и поставить флаг блокировки.
 *
 * Воркер не публикует ничего и никогда. Единственное, что он пишет мимо
 * GitHub, — отметка о времени проверки в KV, чтобы подвал сайта мог честно
 * сказать, когда источник смотрели в последний раз.
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

/** Пока флаг стоит, воркер ничего не предлагает. Снимается руками. */
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
 * Последняя известная запись из репозитория — нужна, чтобы сравнить цены
 * и заметить крупное движение. Читается через GitHub, а не из сборки:
 * воркер живёт дольше, чем конкретная сборка сайта.
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

  // --- скачать --------------------------------------------------------------
  let html: string;
  try {
    const response = await fetchImpl(MINFIN_URL, { headers: { 'user-agent': UA } });
    if (!response.ok) return { kind: 'fetch_failed', status: response.status };
    html = await response.text();
  } catch {
    return { kind: 'fetch_failed', status: 0 };
  }

  // Отметку о проверке ставим независимо от исхода разбора: страницу
  // действительно смотрели, и подвал сайта вправе это показать.
  await env.REPORTS?.put(
    STATUS_KEY,
    JSON.stringify({ last_checked: checkedAt, last_checked_source: MINFIN_URL }),
  );

  // --- разобрать ------------------------------------------------------------
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
    // Блокируем публикацию: изменившаяся вёрстка опаснее отсутствия данных,
    // потому что парсер может начать читать не ту таблицу.
    await env.REPORTS?.put(BLOCK_KEY, `${checkedAt}: ${parseResult.reason}`);
    const issue = failureIssueTexts(parseResult.reason, parseResult.detail, MINFIN_URL, checkedAt);
    if (!(await github.hasOpenIssue(issue.title))) {
      await github.openIssue(issue.title, issue.body, ['парсер']);
    }
    return { kind: 'parse_failed', reason: parseResult.reason };
  }

  const { act, warnings } = parseResult;

  // --- изменилось ли ---------------------------------------------------------
  const previous = await knownAct(env);
  if (!isNewAct(act, previous)) {
    return { kind: 'unchanged', act: act.act_number };
  }

  const branch = branchNameFor(act);
  if (await github.branchExists(branch)) {
    // PR об этом акте уже открыт. Второй заводить незачем.
    return { kind: 'proposal_exists', act: act.act_number };
  }

  // --- предложить -----------------------------------------------------------
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

  // Сырой HTML рядом с записью — доказательство, а не источник данных.
  await github.writeFile(
    texts.evidencePath,
    branch,
    html,
    `Доказательство: страница Минфина на ${checkedAt}`,
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
