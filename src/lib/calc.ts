/**
 * Арифметика калькулятора.
 *
 * Чистые функции без зависимостей: этот модуль уезжает в браузер, и тянуть
 * за собой валидаторы схемы ему незачем.
 *
 * Считается ровно одно: масса × цена за грамм по постановлению. Результат
 * подписывается «стоимость по официальным ценам Минфина», а не «сколько вы
 * получите»: итоговая сумма зависит от опробования и зачётной массы, и этот
 * разрыв закрывать нельзя.
 */

import type { FinenessKey } from './schema.ts';

/** Верхняя граница разумного ввода. Выше — почти наверняка опечатка. */
export const MAX_GRAMS = 100_000;

/** Точность взвешивания золота при приёмке, граммы. Из правил приёмки. */
export const GOLD_WEIGHING_PRECISION_G = 0.01;

/** Точность взвешивания серебра, граммы. */
export const SILVER_WEIGHING_PRECISION_G = 0.1;

export type MassParseFailure =
  /** Поле пустое — не ошибка, просто ещё нечего считать. */
  | 'empty'
  /** Не разбирается как число. */
  | 'not_a_number'
  /** Ноль или отрицательное. */
  | 'not_positive'
  /** Больше `MAX_GRAMS`. */
  | 'too_large';

export type MassParseResult =
  | { readonly ok: true; readonly grams: number }
  | { readonly ok: false; readonly reason: MassParseFailure };

/**
 * Разбирает массу, введённую человеком.
 *
 * Принимает запятую и точку как разделитель дробной части, пробелы внутри
 * числа (в том числе неразрывные) как разделитель тысяч. Всё остальное —
 * отказ: молча «понять» `8..4` или `8,4,4` значит посчитать не то, что ввели.
 */
export function parseMass(raw: string): MassParseResult {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: false, reason: 'empty' };

  // \s покрывает и обычный пробел, и неразрывный, и узкий неразрывный —
  const withoutSpaces = trimmed.replace(/\s/g, '');
  const normalized = withoutSpaces.replace(',', '.');

  // Ровно одно необязательное «точка + цифры», без знака и без экспоненты.
  if (!/^\d+(\.\d+)?$/.test(normalized)) return { ok: false, reason: 'not_a_number' };

  const grams = Number(normalized);
  if (!Number.isFinite(grams)) return { ok: false, reason: 'not_a_number' };
  if (grams <= 0) return { ok: false, reason: 'not_positive' };
  if (grams > MAX_GRAMS) return { ok: false, reason: 'too_large' };

  return { ok: true, grams };
}

/**
 * Масса × цена за грамм, в копейках, с обычным математическим округлением.
 *
 * Считается в целых: цена переводится в копейки, масса — в миллиграммы.
 * Иначе `0.1 * 3` и подобное дают хвосты, которые видно в третьем знаке
 * и которые на сумме в сотни рублей превращаются в копейку расхождения.
 */
export function totalKopecks(grams: number, pricePerGram: number): number {
  const kopecksPerGram = Math.round(pricePerGram * 100);
  const milligrams = Math.round(grams * 1000);
  return Math.round((kopecksPerGram * milligrams) / 1000);
}

export type CalcFailure =
  /** Масса не разобралась. */
  | { readonly kind: 'mass'; readonly reason: MassParseFailure }
  /** Постановление эту пробу не называет. */
  | { readonly kind: 'no_price' }
  /** Нет действующего постановления — считать не по чему. */
  | { readonly kind: 'no_tariff' };

export type CalcResult =
  | {
      readonly ok: true;
      readonly grams: number;
      readonly fineness: FinenessKey;
      readonly pricePerGram: number;
      /** Сумма в копейках — целое, без плавающей точки. */
      readonly totalKopecks: number;
      /** Та же сумма в рублях, для вывода. */
      readonly totalByn: number;
    }
  | { readonly ok: false; readonly failure: CalcFailure };

/**
 * Стоимость по официальным ценам Минфина для введённой массы и пробы.
 *
 * @param rawMass  что ввёл человек, как есть
 * @param fineness выбранная проба
 * @param prices   таблица цен действующего постановления, либо `null`,
 *                 если действующего постановления нет
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
// Вывод чисел
// ---------------------------------------------------------------------------

/** Неразрывный пробел: сумма не должна переноситься посреди числа. */
const NBSP = '\u00A0';

/**
 * `1234.5` → `1 234,50`. Запятая как разделитель дробной части, неразрывный
 * пробел как разделитель тысяч — русская типографика, а не локаль браузера:
 * на сервере и в браузере число должно выглядеть одинаково.
 */
export function formatByn(value: number): string {
  const kopecks = Math.round(value * 100);
  const sign = kopecks < 0 ? '-' : '';
  const absolute = Math.abs(kopecks);
  const rubles = Math.floor(absolute / 100);
  const remainder = absolute % 100;
  return `${sign}${groupThousands(rubles)},${String(remainder).padStart(2, '0')}`;
}

/** Сумма из копеек, минуя обратный перевод в рубли с плавающей точкой. */
export function formatKopecks(kopecks: number): string {
  return formatByn(kopecks / 100);
}

/**
 * Масса для вывода: до трёх знаков, без хвостовых нулей. `8.4` → `8,4`,
 * `10` → `10`, `10.100` → `10,1`.
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
// Тексты отказов
// ---------------------------------------------------------------------------

/**
 * Что показать вместо суммы. Пустое поле — не ошибка и не окрашивается
 * как ошибка: человек просто ещё не ввёл массу.
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

/** Отличает «ещё не ввёл» от «ввёл неверно» — по этому решается подсветка. */
export function isEmptyInput(failure: CalcFailure): boolean {
  return failure.kind === 'mass' && failure.reason === 'empty';
}
