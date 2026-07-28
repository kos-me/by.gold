import { describe, expect, it } from 'vitest';

import {
  formatRuDate,
  formatRuDateShort,
  formatRuPeriod,
  isIsoDate,
  isIsoDateTime,
  minskDate,
  minskDateTime,
} from '../src/lib/date.ts';

describe('isIsoDate', () => {
  it('принимает существующие даты', () => {
    expect(isIsoDate('2000-01-01')).toBe(true);
    expect(isIsoDate('2000-02-29')).toBe(true); // високосный
    expect(isIsoDate('2000-12-31')).toBe(true);
  });

  it('отвергает несуществующие и неформатные', () => {
    expect(isIsoDate('2001-02-29')).toBe(false);
    expect(isIsoDate('2000-04-31')).toBe(false);
    expect(isIsoDate('2000-13-01')).toBe(false);
    expect(isIsoDate('2000-00-10')).toBe(false);
    expect(isIsoDate('01.01.2000')).toBe(false);
    expect(isIsoDate('2000-1-1')).toBe(false);
    expect(isIsoDate(20000101)).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });

  it('сравнение строк работает как сравнение дат', () => {
    expect('2000-01-09' < '2000-01-10').toBe(true);
    expect('2000-09-30' < '2000-10-01').toBe(true);
    expect('1999-12-31' < '2000-01-01').toBe(true);
  });
});

describe('isIsoDateTime', () => {
  it('требует часовой пояс', () => {
    expect(isIsoDateTime('2000-01-10T09:00:00Z')).toBe(true);
    expect(isIsoDateTime('2000-01-10T09:00:00+03:00')).toBe(true);
    expect(isIsoDateTime('2000-01-10T09:00:00')).toBe(false);
    expect(isIsoDateTime('2000-01-10')).toBe(false);
  });
});

describe('minskDate', () => {
  it('минское +3 переводит поздний вечер UTC в следующий день', () => {
    expect(minskDate(new Date('2000-01-10T21:30:00Z'))).toBe('2000-01-11');
    expect(minskDate(new Date('2000-01-10T20:59:59Z'))).toBe('2000-01-10');
  });

  it('в полночь по Минску дата уже новая', () => {
    expect(minskDate(new Date('2000-01-09T21:00:00Z'))).toBe('2000-01-10');
  });

  it('не переводит часы летом — в Беларуси DST отменён', () => {
    // Одно и то же местное время в январе и в июле даёт один и тот же сдвиг.
    expect(minskDate(new Date('2000-07-10T21:00:00Z'))).toBe('2000-07-11');
    expect(minskDate(new Date('2000-01-10T21:00:00Z'))).toBe('2000-01-11');
  });

  it('отдаёт время для отметки о проверке', () => {
    expect(minskDateTime(new Date('2000-01-10T06:40:00Z'))).toEqual({
      date: '2000-01-10',
      time: '09:40',
    });
  });
});

describe('форматирование по-русски', () => {
  it('дата в предложении — в родительном падеже', () => {
    expect(formatRuDate('2000-07-08')).toBe('8 июля 2000');
    expect(formatRuDate('2000-01-31')).toBe('31 января 2000');
    expect(formatRuDate('2000-05-01')).toBe('1 мая 2000');
  });

  it('короткая дата — с ведущими нулями, для клейма', () => {
    expect(formatRuDateShort('2000-07-08')).toBe('08.07.2000');
  });

  it('период не дублирует месяц и год', () => {
    expect(formatRuPeriod('2000-07-03', '2000-07-31')).toBe('3 — 31 июля 2000');
    expect(formatRuPeriod('2000-06-12', '2000-07-02')).toBe('12 июня — 2 июля 2000');
    expect(formatRuPeriod('2000-12-20', '2001-01-15')).toBe('20 декабря 2000 — 15 января 2001');
  });

  it('период без названного срока не выдумывает конечную дату', () => {
    expect(formatRuPeriod('2000-07-03', null)).toBe('с 3 июля 2000, срок не указан');
  });

  it('мусор на вход отдаётся как есть, а не превращается в дату', () => {
    expect(formatRuDate('не дата')).toBe('не дата');
    expect(formatRuDateShort('')).toBe('');
  });
});
