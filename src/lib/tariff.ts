/**
 * Состояние тарифа: показывать цифру или молчать.
 *
 * Единственная функция, которая решает этот вопрос, и она чистая — на вход
 * записи и момент времени, на выходе состояние. Никаких `new Date()` внутри:
 * иначе поведение на границе срока нельзя проверить, не дождавшись полуночи.
 *
 * Три состояния:
 *
 * - `valid`            — есть действующее постановление. Цифра показывается,
 *                        калькулятор работает.
 * - `review_required`  — постановление было, его срок истёк, преемника нет.
 *                        Цифра скрыта, калькулятор выключен, последняя
 *                        известная цифра показывается как архив.
 * - `unavailable`      — действовавшего постановления нет вовсе (пустой файл
 *                        или только будущие записи). Цифры нет и архива нет.
 *
 * `review_required` и `unavailable` — не ошибки. Это обычные состояния
 * страницы, и именно ради них всё построено.
 */

import { minskDate } from './date.ts';
import { FINENESSES, HEADLINE_FINENESS, type FinenessKey, type TariffRecord } from './schema.ts';

export type TariffStatus = 'valid' | 'review_required' | 'unavailable';

/** Почему состояние такое. Определяет текст на странице. */
export type TariffReason =
  /** Действует постановление с названным сроком. */
  | 'in_force_until'
  /** Действует постановление, срок в акте не назван. */
  | 'in_force_no_expiry'
  /** Срок истёк, преемник не опубликован. */
  | 'expired_no_successor'
  /** В репозитории нет ни одной записи. */
  | 'no_records'
  /** Записи есть, но ни одна ещё не вступила в силу. */
  | 'not_yet_effective';

export interface TariffState {
  readonly status: TariffStatus;
  /** Дата, на которую посчитано состояние, `YYYY-MM-DD` по Минску. */
  readonly asOf: string;
  readonly reason: TariffReason;
  /** Запись, по которой можно считать. Не `null` только при `valid`. */
  readonly current: TariffRecord | null;
  /**
   * Последняя вступавшая в силу запись — независимо от того, действует она
   * сейчас или нет. При `review_required` это то, что показывается как архив.
   */
  readonly lastKnown: TariffRecord | null;
  /** Запись, вступающая в силу позже сегодняшнего дня, если такая есть. */
  readonly upcoming: TariffRecord | null;
  /** Все вступавшие в силу записи, новые сначала. Питает историю и спарклайн. */
  readonly history: readonly TariffRecord[];
  /** Сколько дней прошло с истечения срока. Только при `review_required`. */
  readonly daysSinceExpiry: number | null;
}

/**
 * Порядок записей: сначала по дате вступления в силу, потом по дате акта,
 * потом по номеру. Два акта с одной датой вступления — редкость, но порядок
 * должен быть определённым, иначе сборка будет невоспроизводимой.
 */
function compareRecords(a: TariffRecord, b: TariffRecord): number {
  if (a.effective_from !== b.effective_from) return a.effective_from < b.effective_from ? -1 : 1;
  if (a.act_date !== b.act_date) return a.act_date < b.act_date ? -1 : 1;
  return a.act_number.localeCompare(b.act_number, 'ru');
}

/** Число полных суток между двумя ISO-датами. Обе трактуются как UTC-полночь. */
function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

/**
 * Считает состояние тарифа на момент `now`.
 *
 * @param records записи из `data/tariffs.json`, в любом порядке
 * @param now     момент, на который считаем. Часы передаются снаружи.
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

  // Последняя вступившая в силу запись. Она же вытесняет все предыдущие,
  // включая бессрочные: акт без названного срока действует до замены, а не вечно.
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
    // Срок в акте не назван — держим, пока не заменят. Так сказано в брифе.
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

  // Срок истёк, преемника нет: цифру не показываем и не считаем.
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

/** Можно ли считать калькулятором. Один вопрос — один ответ. */
export function isCalculatorEnabled(state: TariffState): boolean {
  return state.status === 'valid' && state.current !== null;
}

/** Пробы записи в каноническом порядке — только те, что назвал акт. */
export function finenessesOf(record: TariffRecord): readonly FinenessKey[] {
  return FINENESSES.filter((key) => record.prices_byn_per_gram[key] !== undefined);
}

/** Цена за грамм для пробы, либо `null`, если акт эту пробу не называет. */
export function priceFor(record: TariffRecord, fineness: FinenessKey): number | null {
  return record.prices_byn_per_gram[fineness] ?? null;
}

/**
 * Проба и цена для крупной цифры наверху. 585 — если акт её назвал; иначе
 * первая имеющаяся. Пустой таблицы цен схема не пропускает, но `null`
 * возвращается честно, а не подставляется нулём.
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
 * Ряд цен одной пробы по истории, от старых к новым — для спарклайна.
 * Записи без этой пробы пропускаются: разрыв в ряду честнее, чем
 * подставленное «примерно столько же».
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
