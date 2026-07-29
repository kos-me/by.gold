/**
 * Tariff state: show the figure, or stay quiet.
 *
 * The one function that answers that question, and it is pure — records and
 * an instant in, state out. No `new Date()` inside: otherwise behaviour at
 * the expiry boundary cannot be checked without waiting for midnight.
 *
 * Three states:
 *
 * - `valid`            — a decree is in force. The figure is shown and the
 *                        calculator works.
 * - `review_required`  — a decree existed, its period has ended, and no
 *                        successor has arrived. The figure is withheld, the
 *                        calculator is off, the last known figure is shown
 *                        as an archive.
 * - `unavailable`      — no decree has ever been in force (empty file, or
 *                        only future-dated records). No figure and no archive.
 *
 * `review_required` and `unavailable` are not errors. They are ordinary
 * states of the page, and the whole thing was built around them.
 */

import { minskDate } from './date.ts';
import { FINENESSES, HEADLINE_FINENESS, type FinenessKey, type TariffRecord } from './schema.ts';

export type TariffStatus = 'valid' | 'review_required' | 'unavailable';

/** Why the state is what it is. Determines the copy on the page. */
export type TariffReason =
  /** A decree with a stated end date is in force. */
  | 'in_force_until'
  /** A decree is in force and names no end date. */
  | 'in_force_no_expiry'
  /** The period has ended and no successor has been published. */
  | 'expired_no_successor'
  /** There is not a single record in the repository. */
  | 'no_records'
  /** Records exist, but none has taken force yet. */
  | 'not_yet_effective';

export interface TariffState {
  readonly status: TariffStatus;
  /** The date the state was computed for, `YYYY-MM-DD` in Minsk. */
  readonly asOf: string;
  readonly reason: TariffReason;
  /** The record to compute against. Non-null only when `valid`. */
  readonly current: TariffRecord | null;
  /**
   * The last record that ever took force, whether or not it is still in
   * force. Under `review_required` this is what is shown as the archive.
   */
  readonly lastKnown: TariffRecord | null;
  /** A record taking force later than today, if there is one. */
  readonly upcoming: TariffRecord | null;
  /** Every record that has taken force, newest first. Feeds history and sparkline. */
  readonly history: readonly TariffRecord[];
  /** Days elapsed since expiry. Only under `review_required`. */
  readonly daysSinceExpiry: number | null;
}

/**
 * Record ordering: by effective date, then act date, then number. Two acts
 * sharing an effective date is rare, but the order must be determined or the
 * build stops being reproducible.
 */
function compareRecords(a: TariffRecord, b: TariffRecord): number {
  if (a.effective_from !== b.effective_from) return a.effective_from < b.effective_from ? -1 : 1;
  if (a.act_date !== b.act_date) return a.act_date < b.act_date ? -1 : 1;
  return a.act_number.localeCompare(b.act_number, 'ru');
}

/** Whole days between two ISO dates. Both are read as UTC midnight. */
function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

/**
 * Computes the tariff state at instant `now`.
 *
 * @param records records from `data/tariffs.json`, in any order
 * @param now     the instant to compute for. The clock comes from outside.
 */
export function resolveTariffState(
  records: readonly TariffRecord[],
  now: Date,
): TariffState {
  const asOf = minskDate(now);
  const ordered = [...records].sort(compareRecords);

  const effective = ordered.filter((record) => record.effective_from <= asOf);
  const future = ordered.filter((record) => record.effective_from > asOf);
  const upcoming = future[0] ?? null;

  // The last record to take force. It supersedes every earlier one, including
  // open-ended ones: an act with no stated end date runs until replaced, not
  // forever.
  const lastKnown = effective.at(-1) ?? null;
  const history = [...effective].reverse();

  if (lastKnown === null) {
    return {
      status: 'unavailable',
      asOf,
      reason: ordered.length === 0 ? 'no_records' : 'not_yet_effective',
      current: null,
      lastKnown: null,
      upcoming,
      history: [],
      daysSinceExpiry: null,
    };
  }

  if (lastKnown.stated_expiry === null) {
    // The act states no end date — hold it until replaced, as the brief says.
    return {
      status: 'valid',
      asOf,
      reason: 'in_force_no_expiry',
      current: lastKnown,
      lastKnown,
      upcoming,
      history,
      daysSinceExpiry: null,
    };
  }

  if (asOf <= lastKnown.stated_expiry) {
    return {
      status: 'valid',
      asOf,
      reason: 'in_force_until',
      current: lastKnown,
      lastKnown,
      upcoming,
      history,
      daysSinceExpiry: null,
    };
  }

  // Expired with no successor: neither show the figure nor compute with it.
  return {
    status: 'review_required',
    asOf,
    reason: 'expired_no_successor',
    current: null,
    lastKnown,
    upcoming,
    history,
    daysSinceExpiry: daysBetween(lastKnown.stated_expiry, asOf),
  };
}

/** Whether the calculator may compute. One question, one answer. */
export function isCalculatorEnabled(state: TariffState): boolean {
  return state.status === 'valid' && state.current !== null;
}

/** The record's finenesses in canonical order — only those the act names. */
export function finenessesOf(record: TariffRecord): readonly FinenessKey[] {
  return FINENESSES.filter((key) => record.prices_byn_per_gram[key] !== undefined);
}

/** The price per gram for a fineness, or `null` if the act does not name it. */
export function priceFor(record: TariffRecord, fineness: FinenessKey): number | null {
  return record.prices_byn_per_gram[fineness] ?? null;
}

/**
 * The fineness and price for the large figure at the top. 585 if the act
 * names it, otherwise the first available. The schema does not allow an
 * empty price table, but `null` is returned honestly rather than filled
 * in with a zero.
 */
export function headlinePrice(
  record: TariffRecord,
): { readonly fineness: FinenessKey; readonly price: number } | null {
  const available = finenessesOf(record);
  const fineness = available.includes(HEADLINE_FINENESS) ? HEADLINE_FINENESS : available[0];
  if (fineness === undefined) return null;
  const price = record.prices_byn_per_gram[fineness];
  if (price === undefined) return null;
  return { fineness, price };
}

/**
 * The price series for one fineness across history, oldest first — for the
 * sparkline. Records lacking that fineness are skipped: a gap in the series
 * is more honest than an interpolated "about the same".
 */
export function priceSeries(
  state: TariffState,
  fineness: FinenessKey = HEADLINE_FINENESS,
): readonly { readonly record: TariffRecord; readonly price: number }[] {
  return [...state.history]
    .reverse()
    .map((record) => ({ record, price: record.prices_byn_per_gram[fineness] }))
    .filter((entry): entry is { record: TariffRecord; price: number } => entry.price !== undefined);
}
