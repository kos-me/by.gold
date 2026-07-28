/**
 * Даты. Всё хранится строками в формате ISO `YYYY-MM-DD` — их можно сравнивать
 * лексикографически, и никакие часовые пояса при этом не участвуют.
 *
 * Беларусь — UTC+3 круглый год, перевода часов нет с 2011 года. Поэтому
 * «сегодня» считается смещением на +3 часа от UTC, без Intl и без tzdata.
 */

/** Смещение Минска от UTC в минутах. Постоянное, DST в Беларуси отменён. */
export const MINSK_UTC_OFFSET_MINUTES = 180;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/** `true`, если строка — существующая календарная дата в формате `YYYY-MM-DD`. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= daysInMonth(y, m);
}

/** `true`, если строка — момент времени в ISO с обязательным часовым поясом. */
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
 * Календарная дата в Минске на момент `now`, строкой `YYYY-MM-DD`.
 * Часы принимаются снаружи — чтобы логику состояния можно было тестировать
 * с подставленным временем, а не ждать полуночи.
 */
export function minskDate(now: Date): string {
  const shifted = new Date(now.getTime() + MINSK_UTC_OFFSET_MINUTES * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/** Момент времени в Минске, строкой `YYYY-MM-DD HH:MM`. Для «проверено в …». */
export function minskDateTime(now: Date): { date: string; time: string } {
  const shifted = new Date(now.getTime() + MINSK_UTC_OFFSET_MINUTES * 60_000);
  const iso = shifted.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
] as const;

/** `2026-07-08` → `8 июля 2026`. Для текста внутри предложения. */
export function formatRuDate(iso: string): string {
  if (!isIsoDate(iso)) return iso;
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return `${d} ${MONTHS_GENITIVE[m - 1]} ${y}`;
}

/** `2026-07-08` → `08.07.2026`. Для клейма и таблиц, где важна колонка. */
export function formatRuDateShort(iso: string): string {
  if (!isIsoDate(iso)) return iso;
  const [y, m, d] = iso.split('-') as [string, string, string];
  return `${d}.${m}.${y}`;
}

/**
 * Период двумя датами: `3 — 31 июля 2026`, `12 июня — 2 июля 2026`.
 * Повторяющиеся месяц и год не дублируются — так в макете.
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
