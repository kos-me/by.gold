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

/**
 * Has the stated expiry passed, as of `now`, in Minsk?
 *
 * The site is static, so its state is baked in at build time. If nobody
 * rebuilds after an act lapses, a deployed page would keep showing a figure
 * that is no longer in force — which is the one failure this project exists
 * to prevent. The browser re-checks this on every visit, so a stale build
 * goes quiet by itself rather than lying until someone notices.
 *
 * `null` expiry means the act names no end date and never goes stale on a
 * date; it is replaced, not expired.
 */
export function isPastExpiry(expiry: string | null, now: Date): boolean {
  if (expiry === null || !isIsoDate(expiry)) return false;
  return minskDate(now) > expiry;
}

/**
 * How many days a build may keep showing its figure before it stops being
 * trusted.
 *
 * The expiry check above only helps when the act in force states an end date.
 * An act that names none — and № 34 of 28.07.2026 names none — runs until
 * something replaces it, so there is no date for a stale build to fail. Without
 * a second test, a build that stopped being rebuilt would show such an act's
 * price for ever, and it would look perfectly current.
 *
 * Hence an age limit on the build itself. Seven days, because the Ministry has
 * replaced an act as little as eight days after the previous one (№ 25 on
 * 17 June 2026, № 27 on the 25th), so a week is the longest a build can be
 * trusted without being refreshed. With a daily rebuild in place this never
 * fires; when it does fire, the deployment pipeline has been broken for a week
 * and the figure genuinely cannot be vouched for.
 */
export const MAX_BUILD_AGE_DAYS = 7;

/**
 * Is this build too old to be trusted, as of `now`?
 *
 * `buildDate` is the Minsk date the site was built, `YYYY-MM-DD`. An
 * unparseable or missing date is treated as **not** stale: the guard must never
 * take a figure away because of a malformed attribute, only because of a date
 * it actually understood.
 */
export function isBuildStale(
  buildDate: string | null,
  now: Date,
  maxAgeDays: number = MAX_BUILD_AGE_DAYS,
): boolean {
  if (buildDate === null || !isIsoDate(buildDate)) return false;
  if (!Number.isFinite(maxAgeDays) || maxAgeDays < 0) return false;
  const built = Date.parse(`${buildDate}T00:00:00Z`);
  const today = Date.parse(`${minskDate(now)}T00:00:00Z`);
  return today - built > maxAgeDays * 86_400_000;
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
