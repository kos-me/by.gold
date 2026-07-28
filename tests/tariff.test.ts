/**
 * Состояние тарифа. Часы подставляются во всех тестах — поведение на границе
 * срока должно быть проверяемо, а не наблюдаемо раз в месяц.
 */

import { describe, expect, it } from 'vitest';

import {
  finenessesOf,
  headlinePrice,
  isCalculatorEnabled,
  priceFor,
  priceSeries,
  resolveTariffState,
} from '../src/lib/tariff.ts';
import { tariff } from './fixtures/records.ts';

/** Подставленные часы: полдень по Минску указанной даты. */
function clock(isoDate: string): Date {
  return new Date(`${isoDate}T09:00:00Z`); // 12:00 в Минске
}

describe('пустой файл — состояние unavailable', () => {
  const state = resolveTariffState([], clock('2000-01-15'));

  it('статус unavailable', () => {
    expect(state.status).toBe('unavailable');
    expect(state.reason).toBe('no_records');
  });

  it('нечего показать и нечего архивировать', () => {
    expect(state.current).toBeNull();
    expect(state.lastKnown).toBeNull();
    expect(state.history).toEqual([]);
  });

  it('калькулятор выключен', () => {
    expect(isCalculatorEnabled(state)).toBe(false);
  });

  it('не выдумывает дату истечения', () => {
    expect(state.daysSinceExpiry).toBeNull();
  });
});

describe('действующее постановление — состояние valid', () => {
  const record = tariff({ effective_from: '2000-01-10', stated_expiry: '2000-01-31' });

  it('внутри срока', () => {
    const state = resolveTariffState([record], clock('2000-01-15'));
    expect(state.status).toBe('valid');
    expect(state.reason).toBe('in_force_until');
    expect(state.current).toEqual(record);
    expect(isCalculatorEnabled(state)).toBe(true);
  });

  it('в первый день действия', () => {
    expect(resolveTariffState([record], clock('2000-01-10')).status).toBe('valid');
  });

  it('в последний день действия — срок «до 31-го» включает 31-е', () => {
    const state = resolveTariffState([record], clock('2000-01-31'));
    expect(state.status).toBe('valid');
    expect(state.current).toEqual(record);
  });

  it('накануне вступления в силу цифры ещё нет', () => {
    const state = resolveTariffState([record], clock('2000-01-09'));
    expect(state.status).toBe('unavailable');
    expect(state.reason).toBe('not_yet_effective');
    expect(state.upcoming).toEqual(record);
    expect(isCalculatorEnabled(state)).toBe(false);
  });

  it('на следующий день после срока — уже нет', () => {
    const state = resolveTariffState([record], clock('2000-02-01'));
    expect(state.status).toBe('review_required');
  });
});

describe('срок истёк, преемника нет — состояние review_required', () => {
  const record = tariff({ effective_from: '2000-01-10', stated_expiry: '2000-01-31' });
  const state = resolveTariffState([record], clock('2000-02-05'));

  it('статус review_required', () => {
    expect(state.status).toBe('review_required');
    expect(state.reason).toBe('expired_no_successor');
  });

  it('считать по нему нельзя', () => {
    expect(state.current).toBeNull();
    expect(isCalculatorEnabled(state)).toBe(false);
  });

  it('последняя известная запись сохраняется — для архива', () => {
    expect(state.lastKnown).toEqual(record);
  });

  it('считает, сколько дней прошло с истечения', () => {
    expect(state.daysSinceExpiry).toBe(5);
  });

  it('в первый день после истечения — один день', () => {
    expect(resolveTariffState([record], clock('2000-02-01')).daysSinceExpiry).toBe(1);
  });
});

describe('акт без названного срока', () => {
  const openEnded = tariff({ effective_from: '2000-01-10', stated_expiry: null });

  it('действует и через год — до замены, а не до даты', () => {
    const state = resolveTariffState([openEnded], clock('2001-06-01'));
    expect(state.status).toBe('valid');
    expect(state.reason).toBe('in_force_no_expiry');
    expect(isCalculatorEnabled(state)).toBe(true);
  });

  it('не превращается в дату истечения', () => {
    const state = resolveTariffState([openEnded], clock('2001-06-01'));
    expect(state.current?.stated_expiry).toBeNull();
    expect(state.daysSinceExpiry).toBeNull();
  });

  it('вытесняется более поздним актом со сроком', () => {
    const successor = tariff({
      act_number: 'TEST-2',
      act_date: '2000-02-01',
      effective_from: '2000-02-10',
      stated_expiry: '2000-02-28',
    });
    const state = resolveTariffState([openEnded, successor], clock('2000-02-15'));
    expect(state.current?.act_number).toBe('TEST-2');
  });

  it('после истечения преемника не оживает — состояние review_required', () => {
    const successor = tariff({
      act_number: 'TEST-2',
      act_date: '2000-02-01',
      effective_from: '2000-02-10',
      stated_expiry: '2000-02-28',
    });
    const state = resolveTariffState([openEnded, successor], clock('2000-03-05'));
    expect(state.status).toBe('review_required');
    expect(state.lastKnown?.act_number).toBe('TEST-2');
  });
});

describe('преемник опубликован', () => {
  const first = tariff({
    act_number: 'TEST-1',
    effective_from: '2000-01-10',
    stated_expiry: '2000-01-31',
  });
  const second = tariff({
    act_number: 'TEST-2',
    act_date: '2000-01-25',
    effective_from: '2000-02-01',
    stated_expiry: '2000-02-29',
  });

  it('без разрыва переходит на новый акт', () => {
    const state = resolveTariffState([first, second], clock('2000-02-01'));
    expect(state.status).toBe('valid');
    expect(state.current?.act_number).toBe('TEST-2');
  });

  it('пока преемник не вступил в силу, действует прежний', () => {
    const state = resolveTariffState([first, second], clock('2000-01-20'));
    expect(state.current?.act_number).toBe('TEST-1');
    expect(state.upcoming?.act_number).toBe('TEST-2');
  });

  it('разрыв между актами — состояние review_required, а не старая цифра', () => {
    const late = tariff({
      act_number: 'TEST-3',
      act_date: '2000-02-20',
      effective_from: '2000-02-25',
      stated_expiry: '2000-03-31',
    });
    const state = resolveTariffState([first, late], clock('2000-02-10'));
    expect(state.status).toBe('review_required');
    expect(state.lastKnown?.act_number).toBe('TEST-1');
    expect(state.upcoming?.act_number).toBe('TEST-3');
  });

  it('порядок записей в файле не влияет на результат', () => {
    const forward = resolveTariffState([first, second], clock('2000-02-05'));
    const reversed = resolveTariffState([second, first], clock('2000-02-05'));
    expect(reversed).toEqual(forward);
  });
});

describe('история', () => {
  const records = [
    tariff({ act_number: 'TEST-1', effective_from: '2000-01-10', stated_expiry: '2000-01-31' }),
    tariff({
      act_number: 'TEST-2',
      act_date: '2000-01-25',
      effective_from: '2000-02-01',
      stated_expiry: '2000-02-29',
    }),
    tariff({
      act_number: 'TEST-3',
      act_date: '2000-02-25',
      effective_from: '2000-03-01',
      stated_expiry: '2000-03-31',
    }),
  ];

  it('новые записи первыми', () => {
    const state = resolveTariffState(records, clock('2000-03-15'));
    expect(state.history.map((r) => r.act_number)).toEqual(['TEST-3', 'TEST-2', 'TEST-1']);
  });

  it('будущие записи в историю не попадают', () => {
    const state = resolveTariffState(records, clock('2000-02-15'));
    expect(state.history.map((r) => r.act_number)).toEqual(['TEST-2', 'TEST-1']);
  });

  it('история сохраняется и в состоянии review_required', () => {
    const state = resolveTariffState(records, clock('2000-04-10'));
    expect(state.status).toBe('review_required');
    expect(state.history).toHaveLength(3);
  });

  it('ряд для спарклайна идёт от старых к новым', () => {
    const state = resolveTariffState(records, clock('2000-03-15'));
    expect(priceSeries(state, '585').map((p) => p.record.act_number)).toEqual([
      'TEST-1',
      'TEST-2',
      'TEST-3',
    ]);
  });

  it('запись без нужной пробы выпадает из ряда, а не дорисовывается', () => {
    const withoutHeadline = tariff({
      act_number: 'TEST-4',
      act_date: '2000-03-20',
      effective_from: '2000-04-01',
      stated_expiry: '2000-04-30',
      prices_byn_per_gram: { '750': 4.0 },
    });
    const state = resolveTariffState([...records, withoutHeadline], clock('2000-04-15'));
    expect(priceSeries(state, '585').map((p) => p.record.act_number)).toEqual([
      'TEST-1',
      'TEST-2',
      'TEST-3',
    ]);
  });
});

describe('граница суток считается по Минску', () => {
  const record = tariff({ effective_from: '2000-01-10', stated_expiry: '2000-01-31' });

  it('в 23:30 по Минску 31-го — ещё действует', () => {
    // 20:30 UTC = 23:30 в Минске, всё ещё 31 января.
    expect(resolveTariffState([record], new Date('2000-01-31T20:30:00Z')).status).toBe('valid');
  });

  it('в 00:30 по Минску 1 февраля — уже нет', () => {
    // 21:30 UTC 31 января = 00:30 1 февраля в Минске.
    const state = resolveTariffState([record], new Date('2000-01-31T21:30:00Z'));
    expect(state.status).toBe('review_required');
    expect(state.asOf).toBe('2000-02-01');
  });
});

describe('доступ к ценам', () => {
  const record = tariff();

  it('пробы отдаются в каноническом порядке', () => {
    expect(finenessesOf(record)).toEqual(['375', '500', '585', '750', '958', '999']);
  });

  it('отдаются только пробы, названные актом', () => {
    const partial = tariff({ prices_byn_per_gram: { '999': 6.0, '585': 3.0 } });
    expect(finenessesOf(partial)).toEqual(['585', '999']);
  });

  it('несуществующая проба — null, а не ноль и не подстановка', () => {
    const partial = tariff({ prices_byn_per_gram: { '585': 3.0 } });
    expect(priceFor(partial, '585')).toBe(3.0);
    expect(priceFor(partial, '750')).toBeNull();
  });

  it('крупная цифра — 585, если акт её назвал', () => {
    expect(headlinePrice(record)).toEqual({ fineness: '585', price: 3.0 });
  });

  it('если 585 в акте нет — первая имеющаяся проба, а не выдуманная', () => {
    const partial = tariff({ prices_byn_per_gram: { '750': 4.0, '999': 6.0 } });
    expect(headlinePrice(partial)).toEqual({ fineness: '750', price: 4.0 });
  });
});
