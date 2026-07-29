/**
 * Parsing Minfin's buyback price page.
 *
 * What the parser extracts: the act number, the act date and the table of
 * prices by fineness.
 *
 * What it CANNOT extract, and this matters: **the page carries neither the
 * effective date nor the expiry date**. It has only "ПРИЛОЖЕНИЕ к
 * постановлению … DD.MM.YYYY № N" and the tables. Both dates live in the text
 * of the act itself, not in its appendix. So the parser leaves
 * `effective_from` and `stated_expiry` empty, and the pull request it opens
 * deliberately fails schema validation until a person fills them in from the
 * act. The red CI check is the gate.
 *
 * The table structure was taken from the live page, not from the mockup:
 *
 * - finenesses sit in their own header row, prices in the "Золото в изделиях
 *   и ломе" row beneath them;
 * - one header cell may hold **two finenesses** (583 and 585 share both the
 *   cell and the price);
 * - the first two cells of the gold row are an index and a label, so prices
 *   are taken from the end.
 *
 * The parser publishes nothing and decides nothing. It only reads.
 */

import { FINENESSES, type FinenessKey } from '../../src/lib/schema.ts';

export interface ParsedAct {
  readonly act_number: string;
  /** ISO `YYYY-MM-DD`. */
  readonly act_date: string;
  readonly prices_byn_per_gram: Readonly<Partial<Record<FinenessKey, number>>>;
}

export type ParseFailureReason =
  /** Empty, or not HTML. */
  | 'empty_document'
  /** The "к постановлению … № N" line was not found. */
  | 'no_act_line'
  /** Several different acts found — almost certainly the archive page. */
  | 'multiple_acts'
  /** No table of finenesses. */
  | 'no_price_table'
  /** The table exists but the gold row does not. */
  | 'no_gold_row'
  /** Header column count and price cell count disagree. */
  | 'column_mismatch'
  /** A price does not parse as a number. */
  | 'unparsable_price';

export type ParseWarningKind =
  /** An expected fineness is missing from the table. */
  | 'missing_fineness'
  /** The table holds a fineness we do not know. */
  | 'unexpected_fineness'
  /** A price moved further than the threshold. */
  | 'large_move';

export interface ParseWarning {
  readonly kind: ParseWarningKind;
  readonly message: string;
}

export type ParseResult =
  | { readonly ok: true; readonly act: ParsedAct; readonly warnings: readonly ParseWarning[] }
  | { readonly ok: false; readonly reason: ParseFailureReason; readonly detail: string };

/** A move larger than this needs a human's eye, but is not a refusal. */
export const LARGE_MOVE_THRESHOLD = 0.15;

// ---------------------------------------------------------------------------

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&emsp;|&ensp;|&thinsp;/gi, ' ')
    .replace(/&laquo;|&raquo;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function withoutNoise(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

/** `08.07.2026` → `2026-07-08`. */
function toIsoDate(ddmmyyyy: string): string | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(ddmmyyyy);
  if (match === null) return null;
  const [, day, month, year] = match as unknown as [string, string, string, string];
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31) return null;
  return `${year}-${month}-${day}`;
}

/** `129,60` → `129.6`. Thousands separators are dropped. */
function parsePrice(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

interface TableRow {
  readonly cells: readonly string[];
}

function parseTables(html: string): { raw: string; rows: TableRow[] }[] {
  const tables: { raw: string; rows: TableRow[] }[] = [];
  for (const match of html.matchAll(/<table[\s\S]*?<\/table>/gi)) {
    const raw = match[0];
    const rows: TableRow[] = [];
    for (const rowMatch of raw.matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
      const cells: string[] = [];
      for (const cellMatch of rowMatch[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
        // <br> inside a cell separates finenesses: "583<br>585" is two of them sharing one price.
        const inner = (cellMatch[1] ?? '').replace(/<br\s*\/?>/gi, '  ');
        cells.push(stripTags(inner).replace(/\s*\s*/g, ' '));
      }
      rows.push({ cells });
    }
    tables.push({ raw, rows });
  }
  return tables;
}

/**
 * Finenesses in a header cell. One cell may hold several: "583 585" is two
 * finenesses sharing a price, not the number 583585.
 */
function finenessesInCell(cell: string): string[] {
  return [...cell.matchAll(/\b(\d{3})\b/g)].map((match) => match[1] as string);
}

// ---------------------------------------------------------------------------

/**
 * Parses the page.
 *
 * @param html   the raw HTML as received
 * @param source the address it came from — used only in error messages
 */
export function parseMinfinPage(html: string, source = ''): ParseResult {
  if (html.trim().length < 200) {
    return { ok: false, reason: 'empty_document', detail: `${source}: empty response` };
  }

  const clean = withoutNoise(html);
  const text = stripTags(clean);

  // --- the act ---------------------------------------------------------------
  // "ПРИЛОЖЕНИЕ к постановлению Министерства финансов … 08.07.2026 № 31"
  //
  // Minfin's act numbers are numeric, but the pattern allows letters too:
  // otherwise fixtures would have to carry plausible numbers, and they are
  // required to be unmistakably fake ("TEST-1"). The token is still pinned
  // tightly after "№", so a stray word cannot land there.
  const actPattern =
    /к\s+постановлению[^№]{0,200}?(\d{2}\.\d{2}\.\d{4})\s*№\s*([A-Za-zА-Яа-я0-9]{1,12}(?:[-/][A-Za-zА-Яа-я0-9]{1,6})?)/gi;
  const acts = [...text.matchAll(actPattern)].map((match) => ({
    date: match[1] as string,
    number: match[2] as string,
  }));

  if (acts.length === 0) {
    return {
      ok: false,
      reason: 'no_act_line',
      detail:
        `${source}: the "к постановлению … № N" line was not found. ` +
        'That is how a maintenance page looks, and any other markup swap.',
    };
  }

  // Several different acts on one page means the archive, not the current
  // page. Picking "probably this one" is not allowed: a wrong pick yields a
  // wrong price.
  const distinct = new Set(acts.map((act) => `${act.date}|${act.number}`));
  if (distinct.size > 1) {
    return {
      ok: false,
      reason: 'multiple_acts',
      detail:
        `${source}: the page carries ${distinct.size} different decrees ` +
        `(${[...distinct].join('; ')}). Looks like the archive, not the page in force.`,
    };
  }

  const act = acts[0] as { date: string; number: string };
  const actDate = toIsoDate(act.date);
  if (actDate === null) {
    return { ok: false, reason: 'no_act_line', detail: `${source}: date "${act.date}" does not parse` };
  }

  // --- the table -------------------------------------------------------------
  const tables = parseTables(clean);
  const priceTable = tables.find((table) =>
    table.rows.some((row) => row.cells.some((cell) => /^\s*пробы\s*$/i.test(cell))),
  );

  if (priceTable === undefined) {
    return {
      ok: false,
      reason: 'no_price_table',
      detail: `${source}: no table headed "ПРОБЫ" was found`,
    };
  }

  // `\w` is no use here: in JavaScript it is an ASCII class, so `золот\w*`
  // does not even match "золото". Only an explicit Cyrillic class works.
  const goldRowIndex = priceTable.rows.findIndex((row) =>
    row.cells.some((cell) => /золот[а-яё]*\s+в\s+издели/i.test(cell)),
  );
  if (goldRowIndex === -1) {
    return {
      ok: false,
      reason: 'no_gold_row',
      detail: `${source}: the table has no "Золото в изделиях и ломе" row`,
    };
  }

  // The fineness row is the nearest row ABOVE gold made entirely of numbers.
  let headerRow: TableRow | undefined;
  for (let index = goldRowIndex - 1; index >= 0; index -= 1) {
    const row = priceTable.rows[index];
    if (row === undefined) continue;
    const numeric = row.cells.filter((cell) => finenessesInCell(cell).length > 0);
    if (numeric.length >= 3 && numeric.length === row.cells.length) {
      headerRow = row;
      break;
    }
  }

  if (headerRow === undefined) {
    return {
      ok: false,
      reason: 'no_price_table',
      detail: `${source}: no row listing finenesses was found above the gold row`,
    };
  }

  const groups = headerRow.cells.map(finenessesInCell);
  const goldCells = priceTable.rows[goldRowIndex]?.cells ?? [];
  // The row's first cells are an index and a label; prices come from the end.
  const priceCells = goldCells.slice(goldCells.length - groups.length);

  if (goldCells.length < groups.length || priceCells.length !== groups.length) {
    return {
      ok: false,
      reason: 'column_mismatch',
      detail:
        `${source}: ${groups.length} finenesses in the header, ` +
        `but only ${goldCells.length} cells in the gold row`,
    };
  }

  // A cell containing letters inside the price block means the columns have
  // shifted and we picked up the row label instead of a price. That must not
  // be parsed: a one-column shift yields plausible but wrong figures.
  const shifted = priceCells.find((cell) => /[а-яёa-z]/i.test(cell));
  if (shifted !== undefined) {
    return {
      ok: false,
      reason: 'column_mismatch',
      detail:
        `${source}: cell "${shifted}" turned up inside the price block — ` +
        'the columns have shifted and the table markup has changed',
    };
  }

  const prices: Partial<Record<FinenessKey, number>> = {};
  const warnings: ParseWarning[] = [];

  for (const [index, group] of groups.entries()) {
    const cell = priceCells[index] ?? '';
    const price = parsePrice(cell);
    if (price === null) {
      return {
        ok: false,
        reason: 'unparsable_price',
        detail: `${source}: price "${cell}" for fineness ${group.join('/')} does not parse as a number`,
      };
    }
    for (const fineness of group) {
      if ((FINENESSES as readonly string[]).includes(fineness)) {
        prices[fineness as FinenessKey] = price;
      } else {
        // A new fineness in the act is worth a look, not a reason to reject the data.
        warnings.push({
          kind: 'unexpected_fineness',
          message: `the table holds fineness ${fineness}, which is not in the site's list`,
        });
      }
    }
  }

  for (const fineness of FINENESSES) {
    if (prices[fineness] === undefined) {
      warnings.push({
        kind: 'missing_fineness',
        message: `fineness ${fineness} is absent from the table`,
      });
    }
  }

  return {
    ok: true,
    act: { act_number: act.number, act_date: actDate, prices_byn_per_gram: prices },
    warnings,
  };
}

/**
 * Compares parsed prices against the previous ones and flags large moves.
 *
 * The threshold is 15%. Exceeding it marks the record as "needs review",
 * **not** as invalid: the gold price genuinely can jump, and rejecting
 * correct data is worse than putting it in front of a person.
 */
export function checkPriceMoves(
  parsed: Readonly<Partial<Record<FinenessKey, number>>>,
  previous: Readonly<Partial<Record<FinenessKey, number>>> | null,
  threshold = LARGE_MOVE_THRESHOLD,
): readonly ParseWarning[] {
  if (previous === null) return [];
  const warnings: ParseWarning[] = [];

  for (const fineness of FINENESSES) {
    const before = previous[fineness];
    const after = parsed[fineness];
    if (before === undefined || after === undefined || before <= 0) continue;

    const move = (after - before) / before;
    if (Math.abs(move) > threshold) {
      const percent = (move * 100).toFixed(1).replace('.', ',');
      warnings.push({
        kind: 'large_move',
        message:
          `fineness ${fineness}: moved ${move > 0 ? '+' : ''}${percent}% ` +
          `(was ${before.toFixed(2)}, now ${after.toFixed(2)}) — check against the act`,
      });
    }
  }

  return warnings;
}

/** Whether the act differs from the last known record. */
export function isNewAct(
  parsed: ParsedAct,
  known: { readonly act_number: string; readonly act_date: string } | null,
): boolean {
  if (known === null) return true;
  return parsed.act_number !== known.act_number || parsed.act_date !== known.act_date;
}
