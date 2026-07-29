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
  it('dot and comma are interchangeable', () => {
    expect(parseMass('8.4')).toEqual({ ok: true, grams: 8.4 });
    expect(parseMass('8,4')).toEqual({ ok: true, grams: 8.4 });
  });

  it('an integer with no fractional part', () => {
    expect(parseMass('12')).toEqual({ ok: true, grams: 12 });
  });

  it('trims outer spaces and inner thousands separators', () => {
    expect(parseMass('  8,4  ')).toEqual({ ok: true, grams: 8.4 });
    expect(parseMass('1 234,5')).toEqual({ ok: true, grams: 1234.5 });
    expect(parseMass(`1${NBSP}234,5`)).toEqual({ ok: true, grams: 1234.5 });
    expect(parseMass(`1${NNBSP}234,5`)).toEqual({ ok: true, grams: 1234.5 });
    expect(parseMass(`1${THINSP}234,5`)).toEqual({ ok: true, grams: 1234.5 });
  });

  it("an empty field is not an error but \'not typed yet\'", () => {
    expect(parseMass('')).toEqual({ ok: false, reason: 'empty' });
    expect(parseMass('   ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('does not try to guess what garbage means', () => {
    for (const input of ['abc', '8..4', '8,4,4', '8-4', '8г', '--3', '1e3', '.5', '8.']) {
      expect(parseMass(input), `"${input}" must be rejected`).toEqual({
        ok: false,
        reason: 'not_a_number',
      });
    }
  });

  it('zero and negatives do not compute', () => {
    expect(parseMass('0')).toEqual({ ok: false, reason: 'not_positive' });
    expect(parseMass('0,00')).toEqual({ ok: false, reason: 'not_positive' });
    // The minus never reaches the digits: the pattern allows no sign.
    expect(parseMass('-3')).toEqual({ ok: false, reason: 'not_a_number' });
  });

  it('too large a mass asks you to check, it does not compute', () => {
    expect(parseMass(String(MAX_GRAMS))).toEqual({ ok: true, grams: MAX_GRAMS });
    expect(parseMass(String(MAX_GRAMS + 1))).toEqual({ ok: false, reason: 'too_large' });
  });

  it('a very small mass is fine — people hand in bits of chain too', () => {
    expect(parseMass('0,01')).toEqual({ ok: true, grams: 0.01 });
  });
});

describe('totalKopecks — integer arithmetic', () => {
  it('plain multiplication', () => {
    expect(totalKopecks(10, 3)).toBe(3000);
    expect(totalKopecks(8.4, 3)).toBe(2520);
  });

  it('leaves no floating-point tails', () => {
    // 0.1 * 3 in a double gives 0.30000000000000004
    expect(totalKopecks(0.1, 3)).toBe(30);
    // 1.1 * 1.1 gives 1.2100000000000002
    expect(totalKopecks(1.1, 1.1)).toBe(121);
  });

  it('rounds half a kopeck up', () => {
    // 1.005 g × 1.00 BYN = 1.005 BYN → 101 kopecks
    expect(totalKopecks(1.005, 1.0)).toBe(101);
  });

  it('a one-kopeck price and one gram give one kopeck', () => {
    expect(totalKopecks(1, 0.01)).toBe(1);
  });
});

describe('calculate — across every fineness', () => {
  it.each(FINENESSES)('fineness %s computes at its own price', (fineness) => {
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

  it('different finenesses give different sums for one mass', () => {
    const sums = FINENESSES.map((fineness) => {
      const result = calculate('10', fineness, PRICES);
      return result.ok ? result.totalKopecks : null;
    });
    expect(new Set(sums).size).toBe(FINENESSES.length);
  });

  it('the sum scales with the mass', () => {
    const one = calculate('1', '585', PRICES);
    const ten = calculate('10', '585', PRICES);
    expect(one.ok && ten.ok).toBe(true);
    if (!one.ok || !ten.ok) return;
    expect(ten.totalKopecks).toBe(one.totalKopecks * 10);
  });

  it('does not compute without a decree in force', () => {
    const result = calculate('10', '585', null);
    expect(result).toEqual({ ok: false, failure: { kind: 'no_tariff' } });
  });

  it('does not compute a fineness the decree omits', () => {
    const result = calculate('10', '750', { '585': 3.0 });
    expect(result).toEqual({ ok: false, failure: { kind: 'no_price' } });
  });

  it('does not substitute zero for a missing price', () => {
    const result = calculate('10', '750', { '585': 3.0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).not.toHaveProperty('totalKopecks');
  });

  it('a mass error reaches the caller with its reason', () => {
    expect(calculate('', '585', PRICES)).toEqual({
      ok: false,
      failure: { kind: 'mass', reason: 'empty' },
    });
    expect(calculate('много', '585', PRICES)).toEqual({
      ok: false,
      failure: { kind: 'mass', reason: 'not_a_number' },
    });
  });

  it('a missing decree does not outrank an empty field', () => {
    // Input is parsed first: the person hears about the field, not the act.
    expect(calculate('', '585', null)).toEqual({
      ok: false,
      failure: { kind: 'mass', reason: 'empty' },
    });
  });
});

describe('formatByn', () => {
  it('always two digits after the comma', () => {
    expect(formatByn(3)).toBe('3,00');
    expect(formatByn(3.5)).toBe('3,50');
    expect(formatByn(3.05)).toBe('3,05');
  });

  it('thousands are separated by a non-breaking space', () => {
    expect(formatByn(1234.5)).toBe(`1${NBSP}234,50`);
    expect(formatByn(1234567.89)).toBe(`1${NBSP}234${NBSP}567,89`);
    expect(formatByn(999.99)).toBe('999,99');
  });

  it('rounds to the kopeck', () => {
    expect(formatByn(3.005)).toBe('3,01');
    expect(formatByn(3.004)).toBe('3,00');
  });

  it('zero and negatives do not break the output', () => {
    expect(formatByn(0)).toBe('0,00');
    expect(formatByn(-3.5)).toBe('-3,50');
  });

  it('straight from kopecks, with no round trip through a float', () => {
    expect(formatKopecks(2520)).toBe('25,20');
    expect(formatKopecks(123456789)).toBe(`1${NBSP}234${NBSP}567,89`);
  });
});

describe('formatGrams', () => {
  it('no trailing zeros', () => {
    expect(formatGrams(8.4)).toBe('8,4');
    expect(formatGrams(10)).toBe('10');
    expect(formatGrams(10.1)).toBe('10,1');
    expect(formatGrams(10.12)).toBe('10,12');
  });

  it('no more than three decimals', () => {
    expect(formatGrams(10.1234)).toBe('10,123');
  });

  it('thousands separate as they do in sums', () => {
    expect(formatGrams(1234.5)).toBe(`1${NBSP}234,5`);
  });
});

describe('refusal text', () => {
  it('an empty field is not styled as an error', () => {
    expect(isEmptyInput({ kind: 'mass', reason: 'empty' })).toBe(true);
    expect(isEmptyInput({ kind: 'mass', reason: 'not_a_number' })).toBe(false);
    expect(isEmptyInput({ kind: 'no_tariff' })).toBe(false);
  });

  it('every refusal has its own text', () => {
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

  it('no refusal text promises a sum', () => {
    // Russian stems: "you will get", "earn", "advantage", "forecast".
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

describe('the calculator invents no price', () => {
  it('an empty price table refuses every fineness', () => {
    for (const fineness of FINENESSES) {
      const result = calculate('10', fineness, {});
      expect(result).toEqual({ ok: false, failure: { kind: 'no_price' } });
    }
  });

  it('an unknown fineness is refused, not rounded to the nearest', () => {
    const result = calculate('10', '999' as FinenessKey, PRICES);
    expect(result).toEqual({ ok: false, failure: { kind: 'no_price' } });
  });
});
