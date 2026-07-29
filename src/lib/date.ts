/**
 * Dates. Everything is stored as ISO `YYYY-MM-DD` strings — those compare
 * lexicographically, and no time zone is involved in the comparison.
 *
 * Belarus is UTC+3 all year; the clock has not changed since 2011. So "today"
 * is computed by shifting UTC by +3 hours, with no Intl and no tzdata.
 */

/** Minsk's offset from UTC in minutes. Constant — Belarus abolished DST. */
export const MINSK_UTC_OFFSET_MINUTES = 180;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/** True when the string is a real calendar date in `YYYY-MM-DD` form. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= daysInMonth(y, m);
}

/** True when the string is an ISO instant with a mandatory time zone. */
export function isIsoDateTime(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATETIME.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * The calendar date in Minsk at instant `now`, as `YYYY-MM-DD`.
 *
 * The clock is passed in from outside so that behaviour at the expiry
 * boundary can be tested rather than waited for.
 */
export function minskDate(now: Date): string {
  const shifted = new Date(now.getTime() + MINSK_UTC_OFFSET_MINUTES * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/** The instant in Minsk as `{ date, time }`. Used for "checked at …". */
export function minskDateTime(now: Date): { date: string; time: string } {
  const shifted = new Date(now.getTime() + MINSK_UTC_OFFSET_MINUTES * 60_000);
  const iso = shifted.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/** Russian month names in the genitive case — the form used inside a sentence. */
const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
] as const;

/** `2026-07-08` → `8 июля 2026`. For prose. */
export function formatRuDate(iso: string): string {
  if (!isIsoDate(iso)) return iso;
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return `${d} ${MONTHS_GENITIVE[m - 1]} ${y}`;
}

/** `2026-07-08` → `08.07.2026`. For the hallmark and tables, where the column matters. */
export function formatRuDateShort(iso: string): string {
  if (!isIsoDate(iso)) return iso;
  const [y, m, d] = iso.split('-') as [string, string, string];
  return `${d}.${m}.${y}`;
}

/**
 * A period as two dates: `3 — 31 июля 2026`, `12 июня — 2 июля 2026`.
 * A repeated month or year is not printed twice — as in the mockup.
 */
export function formatRuPeriod(fromIso: string, toIso: string | null): string {
  if (!isIsoDate(fromIso)) return fromIso;
  if (toIso === null) return `с ${formatRuDate(fromIso)}, срок не указан`;
  if (!isIsoDate(toIso)) return `${formatRuDate(fromIso)} — ${toIso}`;

  const [fy, fm, fd] = fromIso.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = toIso.split('-').map(Number) as [number, number, number];

  if (fy === ty && fm === tm) return `${fd} — ${td} ${MONTHS_GENITIVE[tm - 1]} ${ty}`;
  if (fy === ty) return `${fd} ${MONTHS_GENITIVE[fm - 1]} — ${td} ${MONTHS_GENITIVE[tm - 1]} ${ty}`;
  return `${formatRuDate(fromIso)} — ${formatRuDate(toIso)}`;
}
