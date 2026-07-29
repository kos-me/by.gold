import { describe, expect, it } from 'vitest';

import {
  calculate,
  failureText,
  formatByn,
  formatGrams,
  formatKopecks,
  isEmptyInput,
  MAX_GRAMS,
  parseMass,
  totalKopecks,
} from '../src/lib/calc.ts';
import { FINENESSES, type FinenessKey } from '../src/lib/schema.ts';
import { tariff } from './fixtures/records.ts';

const NBSP = '\u00A0';
const NNBSP = '\u202F';
const THINSP = '\u2009';
const PRICES = tariff().prices_byn_per_gram;

describe('parseMass', () => {
  it('точка и запятая — одно и то же', () => {
    expect(parseMass('8.4')).toEqual({ ok: true, grams: 8.4 });
    expect(parseMass('8,4')).toEqual({ ok: true, grams: 8.4 });
  });

  it('целое без дробной части', () => {
    expect(parseMass('12')).toEqual({ ok: true, grams: 12 });
  });

  it('обрезает пробелы по краям и разделители тысяч внутри', () => {
    expect(parseMass('  8,4  ')).toEqual({ ok: true, grams: 8.4 });
    expect(parseMass('1 234,5')).toEqual({ ok: true, grams: 1234.5 });
    expect(parseMass(`1${NBSP}234,5`)).toEqual({ ok: true, grams: 1234.5 });
    expect(parseMass(`1${NNBSP}234,5`)).toEqual({ ok: true, grams: 1234.5 });
    expect(parseMass(`1${THINSP}234,5`)).toEqual({ ok: true, grams: 1234.5 });
  });

  it('пустое поле — не ошибка, а «ещё не ввёл»', () => {
    expect(parseMass('')).toEqual({ ok: false, reason: 'empty' });
    expect(parseMass('   ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('не пытается угадать смысл мусора', () => {
    for (const input of ['abc', '8..4', '8,4,4', '8-4', '8г', '--3', '1e3', '.5', '8.']) {
      expect(parseMass(input), `«${input}» должен быть отвергнут`).toEqual({
        ok: false,
        reason: 'not_a_number',
      });
    }
  });

  it('ноль и отрицательные не считаются', () => {
    expect(parseMass('0')).toEqual({ ok: false, reason: 'not_positive' });
    expect(parseMass('0,00')).toEqual({ ok: false, reason: 'not_positive' });
    // Минус до цифр не доходит: регулярное выражение знака не допускает.
    expect(parseMass('-3')).toEqual({ ok: false, reason: 'not_a_number' });
  });

  it('слишком большая масса — просьба проверить, а не расчёт', () => {
    expect(parseMass(String(MAX_GRAMS))).toEqual({ ok: true, grams: MAX_GRAMS });
    expect(parseMass(String(MAX_GRAMS + 1))).toEqual({ ok: false, reason: 'too_large' });
  });

  it('очень маленькая масса допустима — обломок цепочки тоже сдают', () => {
    expect(parseMass('0,01')).toEqual({ ok: true, grams: 0.01 });
  });
});

describe('totalKopecks — целочисленная арифметика', () => {
  it('простое умножение', () => {
    expect(totalKopecks(10, 3)).toBe(3000);
    expect(totalKopecks(8.4, 3)).toBe(2520);
  });

  it('не оставляет хвостов плавающей точки', () => {
    // 0.1 * 3 в double даёт 0.30000000000000004
    expect(totalKopecks(0.1, 3)).toBe(30);
    // 1.1 * 1.1 даёт 1.2100000000000002
    expect(totalKopecks(1.1, 1.1)).toBe(121);
  });

  it('округляет половину копейки вверх', () => {
    // 1.005 г × 1.00 BYN = 1.005 BYN → 101 копейка
    expect(totalKopecks(1.005, 1.0)).toBe(101);
  });

  it('копеечная цена и грамм дают копейку', () => {
    expect(totalKopecks(1, 0.01)).toBe(1);
  });
});

describe('calculate — по всем пробам', () => {
  it.each(FINENESSES)('проба %s считается по своей цене', (fineness) => {
    const price = PRICES[fineness];
    expect(price).toBeDefined();
    if (price === undefined) return;

    const result = calculate('10', fineness, PRICES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.fineness).toBe(fineness);
    expect(result.pricePerGram).toBe(price);
    expect(result.totalKopecks).toBe(Math.round(price * 100) * 10);
    expect(result.totalByn).toBeCloseTo(price * 10, 10);
  });

  it('разные пробы дают разные суммы при одной массе', () => {
    const sums = FINENESSES.map((fineness) => {
      const result = calculate('10', fineness, PRICES);
      return result.ok ? result.totalKopecks : null;
    });
    expect(new Set(sums).size).toBe(FINENESSES.length);
  });

  it('сумма растёт пропорционально массе', () => {
    const one = calculate('1', '585', PRICES);
    const ten = calculate('10', '585', PRICES);
    expect(one.ok && ten.ok).toBe(true);
    if (!one.ok || !ten.ok) return;
    expect(ten.totalKopecks).toBe(one.totalKopecks * 10);
  });

  it('не считает без действующего постановления', () => {
    const result = calculate('10', '585', null);
    expect(result).toEqual({ ok: false, failure: { kind: 'no_tariff' } });
  });

  it('не считает пробу, которой в постановлении нет', () => {
    const result = calculate('10', '750', { '585': 3.0 });
    expect(result).toEqual({ ok: false, failure: { kind: 'no_price' } });
  });

  it('не подставляет ноль вместо отсутствующей цены', () => {
    const result = calculate('10', '750', { '585': 3.0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).not.toHaveProperty('totalKopecks');
  });

  it('ошибка массы доходит до вызывающего с причиной', () => {
    expect(calculate('', '585', PRICES)).toEqual({
      ok: false,
      failure: { kind: 'mass', reason: 'empty' },
    });
    expect(calculate('много', '585', PRICES)).toEqual({
      ok: false,
      failure: { kind: 'mass', reason: 'not_a_number' },
    });
  });

  it('отсутствие постановления важнее пустого поля не становится', () => {
    // Сначала разбирается ввод: человеку сообщают про поле, а не про акт.
    expect(calculate('', '585', null)).toEqual({
      ok: false,
      failure: { kind: 'mass', reason: 'empty' },
    });
  });
});

describe('formatByn', () => {
  it('всегда две цифры после запятой', () => {
    expect(formatByn(3)).toBe('3,00');
    expect(formatByn(3.5)).toBe('3,50');
    expect(formatByn(3.05)).toBe('3,05');
  });

  it('тысячи разделяются неразрывным пробелом', () => {
    expect(formatByn(1234.5)).toBe(`1${NBSP}234,50`);
    expect(formatByn(1234567.89)).toBe(`1${NBSP}234${NBSP}567,89`);
    expect(formatByn(999.99)).toBe('999,99');
  });

  it('округляет до копейки', () => {
    expect(formatByn(3.005)).toBe('3,01');
    expect(formatByn(3.004)).toBe('3,00');
  });

  it('ноль и отрицательные не ломают вывод', () => {
    expect(formatByn(0)).toBe('0,00');
    expect(formatByn(-3.5)).toBe('-3,50');
  });

  it('из копеек — без обратного перевода через дробь', () => {
    expect(formatKopecks(2520)).toBe('25,20');
    expect(formatKopecks(123456789)).toBe(`1${NBSP}234${NBSP}567,89`);
  });
});

describe('formatGrams', () => {
  it('без хвостовых нулей', () => {
    expect(formatGrams(8.4)).toBe('8,4');
    expect(formatGrams(10)).toBe('10');
    expect(formatGrams(10.1)).toBe('10,1');
    expect(formatGrams(10.12)).toBe('10,12');
  });

  it('не больше трёх знаков', () => {
    expect(formatGrams(10.1234)).toBe('10,123');
  });

  it('тысячи разделяются так же, как в суммах', () => {
    expect(formatGrams(1234.5)).toBe(`1${NBSP}234,5`);
  });
});

describe('тексты отказов', () => {
  it('пустое поле не окрашивается как ошибка', () => {
    expect(isEmptyInput({ kind: 'mass', reason: 'empty' })).toBe(true);
    expect(isEmptyInput({ kind: 'mass', reason: 'not_a_number' })).toBe(false);
    expect(isEmptyInput({ kind: 'no_tariff' })).toBe(false);
  });

  it('у каждого отказа есть свой текст', () => {
    const failures = [
      { kind: 'mass', reason: 'empty' },
      { kind: 'mass', reason: 'not_a_number' },
      { kind: 'mass', reason: 'not_positive' },
      { kind: 'mass', reason: 'too_large' },
      { kind: 'no_price' },
      { kind: 'no_tariff' },
    ] as const;
    for (const failure of failures) {
      expect(failureText(failure).length).toBeGreaterThan(0);
    }
  });

  it('ни один текст не обещает сумму', () => {
    const forbidden = ['получите', 'заработ', 'выгод', 'прогноз'];
    const texts = [
      failureText({ kind: 'mass', reason: 'empty' }),
      failureText({ kind: 'mass', reason: 'too_large' }),
      failureText({ kind: 'no_price' }),
      failureText({ kind: 'no_tariff' }),
    ];
    for (const text of texts) {
      for (const word of forbidden) expect(text.toLowerCase()).not.toContain(word);
    }
  });
});

describe('калькулятор не изобретает цену', () => {
  it('пустая таблица цен — отказ по каждой пробе', () => {
    for (const fineness of FINENESSES) {
      const result = calculate('10', fineness, {});
      expect(result).toEqual({ ok: false, failure: { kind: 'no_price' } });
    }
  });

  it('неизвестная проба на входе — отказ, а не ближайшая', () => {
    const result = calculate('10', '900' as FinenessKey, PRICES);
    expect(result).toEqual({ ok: false, failure: { kind: 'no_price' } });
  });
});
