/**
 * Calculator arithmetic.
 *
 * Pure functions with no dependencies: this module ships to the browser, and
 * it has no business dragging the schema validators along with it.
 *
 * It computes exactly one thing: mass × price per gram from the decree. The
 * result is labelled "стоимость по официальным ценам Минфина", never "what
 * you will get" — the final sum depends on the assay and the accepted metal
 * mass, and that gap must not be papered over.
 *
 * User-facing strings stay Russian; comments are English.
 */

import type { FinenessKey } from './schema.ts';

/** Upper bound on sane input. Above this it is almost certainly a typo. */
export const MAX_GRAMS = 100_000;

/** Weighing precision for gold at the counter, in grams. From the acceptance rules. */
export const GOLD_WEIGHING_PRECISION_G = 0.01;

/** Weighing precision for silver, in grams. */
export const SILVER_WEIGHING_PRECISION_G = 0.1;

export type MassParseFailure =
  /** Field is empty — not an error, just nothing to compute yet. */
  | 'empty'
  /** Does not parse as a number. */
  | 'not_a_number'
  /** Zero or negative. */
  | 'not_positive'
  /** Greater than `MAX_GRAMS`. */
  | 'too_large';

export type MassParseResult =
  | { readonly ok: true; readonly grams: number }
  | { readonly ok: false; readonly reason: MassParseFailure };

/**
 * Parses a mass as typed by a person.
 *
 * Accepts comma or dot as the decimal separator, and spaces inside the number
 * (including non-breaking ones) as thousands separators. Everything else is
 * refused: silently "understanding" `8..4` or `8,4,4` means computing
 * something other than what was entered.
 */
export function parseMass(raw: string): MassParseResult {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: false, reason: 'empty' };

  // \s covers the ordinary space, the non-breaking one and the narrow
  // non-breaking one — people paste a mass from anywhere, separators included.
  const withoutSpaces = trimmed.replace(/\s/g, '');
  const normalized = withoutSpaces.replace(',', '.');

  // Exactly one optional "dot + digits", no sign and no exponent.
  if (!/^\d+(\.\d+)?$/.test(normalized)) return { ok: false, reason: 'not_a_number' };

  const grams = Number(normalized);
  if (!Number.isFinite(grams)) return { ok: false, reason: 'not_a_number' };
  if (grams <= 0) return { ok: false, reason: 'not_positive' };
  if (grams > MAX_GRAMS) return { ok: false, reason: 'too_large' };

  return { ok: true, grams };
}

/**
 * Mass × price per gram, in kopecks, with ordinary half-up rounding.
 *
 * Computed in integers: the price becomes kopecks, the mass becomes
 * milligrams. Otherwise `0.1 * 3` and friends leave tails visible in the
 * third decimal, which on a sum of several hundred roubles turns into a
 * kopeck of disagreement with the counter.
 */
export function totalKopecks(grams: number, pricePerGram: number): number {
  const kopecksPerGram = Math.round(pricePerGram * 100);
  const milligrams = Math.round(grams * 1000);
  return Math.round((kopecksPerGram * milligrams) / 1000);
}

export type CalcFailure =
  /** The mass did not parse. */
  | { readonly kind: 'mass'; readonly reason: MassParseFailure }
  /** The decree does not name this fineness. */
  | { readonly kind: 'no_price' }
  /** There is no decree in force — nothing to compute against. */
  | { readonly kind: 'no_tariff' };

export type CalcResult =
  | {
      readonly ok: true;
      readonly grams: number;
      readonly fineness: FinenessKey;
      readonly pricePerGram: number;
      /** The sum in kopecks — an integer, no floating point. */
      readonly totalKopecks: number;
      /** The same sum in roubles, for display. */
      readonly totalByn: number;
    }
  | { readonly ok: false; readonly failure: CalcFailure };

/**
 * The value at Minfin's official prices for the entered mass and fineness.
 *
 * @param rawMass  what the person typed, verbatim
 * @param fineness the selected fineness
 * @param prices   the price table of the decree in force, or `null` when
 *                 there is no decree in force
 */
export function calculate(
  rawMass: string,
  fineness: FinenessKey,
  prices: Readonly<Partial<Record<FinenessKey, number>>> | null,
): CalcResult {
  const mass = parseMass(rawMass);
  if (!mass.ok) return { ok: false, failure: { kind: 'mass', reason: mass.reason } };
  if (prices === null) return { ok: false, failure: { kind: 'no_tariff' } };

  const pricePerGram = prices[fineness];
  if (pricePerGram === undefined) return { ok: false, failure: { kind: 'no_price' } };

  const kopecks = totalKopecks(mass.grams, pricePerGram);
  return {
    ok: true,
    grams: mass.grams,
    fineness,
    pricePerGram,
    totalKopecks: kopecks,
    totalByn: kopecks / 100,
  };
}

// ---------------------------------------------------------------------------
// Number formatting
// ---------------------------------------------------------------------------

/** Non-breaking space: a sum must never wrap in the middle of a number. */
const NBSP = '\u00A0';

/**
 * `1234.5` → `1 234,50`. Comma as the decimal separator, non-breaking space
 * for thousands — Russian typography written out by hand rather than taken
 * from the browser locale, so the number looks identical on the server and
 * in the browser whatever locale the visitor has.
 */
export function formatByn(value: number): string {
  const kopecks = Math.round(value * 100);
  const sign = kopecks < 0 ? '-' : '';
  const absolute = Math.abs(kopecks);
  const rubles = Math.floor(absolute / 100);
  const remainder = absolute % 100;
  return `${sign}${groupThousands(rubles)},${String(remainder).padStart(2, '0')}`;
}

/** A sum straight from kopecks, skipping the round trip through a float. */
export function formatKopecks(kopecks: number): string {
  return formatByn(kopecks / 100);
}

/**
 * A mass for display: up to three decimals, no trailing zeros.
 * `8.4` → `8,4`, `10` → `10`, `10.100` → `10,1`.
 */
export function formatGrams(grams: number): string {
  const rounded = Math.round(grams * 1000) / 1000;
  const [whole = '0', fraction] = rounded.toFixed(3).split('.');
  const trimmed = (fraction ?? '').replace(/0+$/, '');
  const groupedWhole = groupThousands(Number(whole));
  return trimmed === '' ? groupedWhole : `${groupedWhole},${trimmed}`;
}

function groupThousands(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

// ---------------------------------------------------------------------------
// Refusal text
// ---------------------------------------------------------------------------

/**
 * What to show instead of a sum. An empty field is not an error and is not
 * styled as one: the person simply has not typed a mass yet.
 */
export function failureText(failure: CalcFailure): string {
  if (failure.kind === 'no_price') return 'этой пробы нет в постановлении';
  if (failure.kind === 'no_tariff') return '—';

  switch (failure.reason) {
    case 'empty':
      return 'введите массу';
    case 'not_a_number':
      return 'только цифры';
    case 'not_positive':
      return 'масса больше нуля';
    case 'too_large':
      return 'проверьте массу';
  }
}

/** Distinguishes "hasn't typed yet" from "typed something wrong" — drives the styling. */
export function isEmptyInput(failure: CalcFailure): boolean {
  return failure.kind === 'mass' && failure.reason === 'empty';
}
