/**
 * Proposing a data change: branch, record, evidence, pull request.
 *
 * The key property: **the proposed record deliberately fails schema
 * validation.** Minfin's page carries neither the effective date nor the
 * expiry date — they live in the text of the act. The worker puts `null` in
 * their place, CI on the pull request goes red, and merging it without
 * opening the act and filling both dates in is impossible. The red check is
 * not an annoyance here; it is the gate itself.
 */

import type { TariffRecord } from '../../src/lib/schema.ts';
import type { ParsedAct, ParseWarning } from './minfin.ts';

/** A draft record: everything that could be read, plus the holes for dates. */
export interface DraftRecord extends Omit<TariffRecord, 'effective_from' | 'stated_expiry'> {
  /** `null` — a person fills this in from the act. The schema rejects it, by design. */
  readonly effective_from: null;
  readonly stated_expiry: null;
}

export function buildDraft(act: ParsedAct, sourceUrl: string, fetchedAt: string): DraftRecord {
  return {
    act_number: act.act_number,
    act_date: act.act_date,
    effective_from: null,
    stated_expiry: null,
    source_url: sourceUrl,
    transcribed_at: fetchedAt,
    transcribed_by: 'FILL IN: who checked this against the act',
    prices_byn_per_gram: act.prices_byn_per_gram,
    notes: 'Draft, assembled automatically. Reconcile against the act before merging.',
  };
}

/** Branch name. Identical for a given act, so a second PR never opens. */
export function branchNameFor(act: ParsedAct): string {
  const safe = act.act_number.replace(/[^A-Za-z0-9-]/g, '_');
  return `minfin/act-${safe}-${act.act_date}`;
}

/**
 * Appends the draft to the array of records and returns the file's JSON.
 * Order in the file does not matter — the code sorts for itself — but the new
 * record is appended at the end so the diff reads as "one record added".
 */
export function appendDraft(existingJson: string, draft: DraftRecord): string {
  let records: unknown[];
  try {
    const parsed = JSON.parse(existingJson) as unknown;
    records = Array.isArray(parsed) ? parsed : [];
  } catch {
    records = [];
  }
  return `${JSON.stringify([...records, draft], null, 2)}\n`;
}

export interface ProposalTexts {
  readonly title: string;
  readonly body: string;
  readonly commitMessage: string;
  readonly evidencePath: string;
}

export function proposalTexts(
  act: ParsedAct,
  warnings: readonly ParseWarning[],
  sourceUrl: string,
  checkedAt: string,
): ProposalTexts {
  const safe = act.act_number.replace(/[^A-Za-z0-9-]/g, '_');
  const evidencePath = `evidence/minfin-${safe}-${act.act_date}.html`;

  const priceLines = Object.entries(act.prices_byn_per_gram)
    .map(([fineness, price]) => `| ${fineness} | ${price.toFixed(2).replace('.', ',')} |`)
    .join('\n');

  const warningBlock =
    warnings.length === 0
      ? '_The parser raised no warnings._'
      : warnings.map((warning) => `- **${warning.kind}** — ${warning.message}`).join('\n');

  const body = [
    `Minfin's page now shows decree **№ ${act.act_number}** of ${act.act_date}.`,
    '',
    '## This PR must not be merged as it stands',
    '',
    'Its data check is **red, and that is deliberate**. The ministry page carries',
    'neither the effective date nor the expiry date — both live in the text of the',
    'act itself. The worker left `null` in their place.',
    '',
    '### What to do',
    '',
    '1. Open the act itself (not this page, not a news story about it).',
    '2. Fill in `effective_from` — the date it takes force.',
    '3. Fill in `stated_expiry` — the date through which it applies.',
    '   **If the act names no end date, leave `null`.** Inventing one is forbidden.',
    '4. Fill in `transcribed_by` — who checked it.',
    '5. Compare the price table below against the table in the act, by eye.',
    '6. Confirm the check has gone green, then merge.',
    '',
    '## What the parser read',
    '',
    '| fineness | BYN per gram |',
    '|---|---|',
    priceLines,
    '',
    '## Parser warnings',
    '',
    warningBlock,
    '',
    '## Evidence',
    '',
    `The page's raw HTML at the moment of the check is in \`${evidencePath}\` on this branch.`,
    `Source: ${sourceUrl}`,
    `Read at: ${checkedAt}`,
    '',
    '---',
    '',
    '_Opened automatically. No figure reaches the site without this PR being merged._',
  ].join('\n');

  return {
    title: `Minfin: decree № ${act.act_number} of ${act.act_date}`,
    body,
    commitMessage: `Draft: decree № ${act.act_number} of ${act.act_date}\n\nAssembled automatically. The effective and expiry dates are not filled\nin — they are absent from the source page.`,
    evidencePath,
  };
}

/** Issue text for when parsing failed. */
export function failureIssueTexts(
  reason: string,
  detail: string,
  sourceUrl: string,
  checkedAt: string,
): { title: string; body: string } {
  return {
    title: `Minfin parser failed: ${reason}`,
    body: [
      'A check of the Minfin page ended in a parse failure.',
      '',
      `- **Reason:** \`${reason}\``,
      `- **Detail:** ${detail}`,
      `- **Source:** ${sourceUrl}`,
      `- **When:** ${checkedAt}`,
      '',
      'Publication is blocked by the `block:publish` flag in KV. While it is set',
      'the worker will propose no changes even if the next check parses cleanly.',
      'That guards against the case where the markup changed enough that the',
      'parser reads the wrong table and the figures still look plausible.',
      '',
      '### What to do',
      '',
      '1. Open the page by hand and see what changed.',
      '2. Fix the parser and add a fixture for this case.',
      '3. Clear the flag: `wrangler kv key delete --binding REPORTS "block:publish"`.',
      '',
      '_Filed automatically._',
    ].join('\n'),
  };
}
