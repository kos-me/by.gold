import { describe, expect, it } from 'vitest';

import {
  isPastExpiry,
  formatRuDate,
  formatRuDateShort,
  formatRuPeriod,
  isIsoDate,
  isIsoDateTime,
  minskDate,
  minskDateTime,
} from '../src/lib/date.ts';

describe('isIsoDate', () => {
  it('accepts real calendar dates', () => {
    expect(isIsoDate('2000-01-01')).toBe(true);
    expect(isIsoDate('2000-02-29')).toBe(true); // leap year
    expect(isIsoDate('2000-12-31')).toBe(true);
  });

  it('rejects impossible and malformed ones', () => {
    expect(isIsoDate('2001-02-29')).toBe(false);
    expect(isIsoDate('2000-04-31')).toBe(false);
    expect(isIsoDate('2000-13-01')).toBe(false);
    expect(isIsoDate('2000-00-10')).toBe(false);
    expect(isIsoDate('01.01.2000')).toBe(false);
    expect(isIsoDate('2000-1-1')).toBe(false);
    expect(isIsoDate(20000101)).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });

  it('string comparison behaves as date comparison', () => {
    expect('2000-01-09' < '2000-01-10').toBe(true);
    expect('2000-09-30' < '2000-10-01').toBe(true);
    expect('1999-12-31' < '2000-01-01').toBe(true);
  });
});

describe('isIsoDateTime', () => {
  it('requires a time zone', () => {
    expect(isIsoDateTime('2000-01-10T09:00:00Z')).toBe(true);
    expect(isIsoDateTime('2000-01-10T09:00:00+03:00')).toBe(true);
    expect(isIsoDateTime('2000-01-10T09:00:00')).toBe(false);
    expect(isIsoDateTime('2000-01-10')).toBe(false);
  });
});

describe('minskDate', () => {
  it("Minsk's +3 moves a late UTC evening into the next day", () => {
    expect(minskDate(new Date('2000-01-10T21:30:00Z'))).toBe('2000-01-11');
    expect(minskDate(new Date('2000-01-10T20:59:59Z'))).toBe('2000-01-10');
  });

  it('at midnight in Minsk the date is already the new one', () => {
    expect(minskDate(new Date('2000-01-09T21:00:00Z'))).toBe('2000-01-10');
  });

  it('no summer clock change — Belarus abolished DST', () => {
    // The same local time in January and July yields the same offset.
    expect(minskDate(new Date('2000-07-10T21:00:00Z'))).toBe('2000-07-11');
    expect(minskDate(new Date('2000-01-10T21:00:00Z'))).toBe('2000-01-11');
  });

  it('returns the time for the check stamp', () => {
    expect(minskDateTime(new Date('2000-01-10T06:40:00Z'))).toEqual({
      date: '2000-01-10',
      time: '09:40',
    });
  });
});

describe('Russian formatting', () => {
  it('a date inside a sentence takes the genitive', () => {
    expect(formatRuDate('2000-07-08')).toBe('8 июля 2000');
    expect(formatRuDate('2000-01-31')).toBe('31 января 2000');
    expect(formatRuDate('2000-05-01')).toBe('1 мая 2000');
  });

  it('the short date keeps leading zeros, for the hallmark', () => {
    expect(formatRuDateShort('2000-07-08')).toBe('08.07.2000');
  });

  it('a period does not repeat the month and year', () => {
    expect(formatRuPeriod('2000-07-03', '2000-07-31')).toBe('3 — 31 июля 2000');
    expect(formatRuPeriod('2000-06-12', '2000-07-02')).toBe('12 июня — 2 июля 2000');
    expect(formatRuPeriod('2000-12-20', '2001-01-15')).toBe('20 декабря 2000 — 15 января 2001');
  });

  it('a period with no stated end invents no end date', () => {
    expect(formatRuPeriod('2000-07-03', null)).toBe('с 3 июля 2000, срок не указан');
  });

  it('garbage in comes back out unchanged, not turned into a date', () => {
    expect(formatRuDate('не дата')).toBe('не дата');
    expect(formatRuDateShort('')).toBe('');
  });
});

describe('isPastExpiry — the stale-build guard', () => {
  it('inside the period it is not stale', () => {
    expect(isPastExpiry('2000-01-31', new Date('2000-01-15T12:00:00Z'))).toBe(false);
  });

  it('the last day of the period is not stale', () => {
    expect(isPastExpiry('2000-01-31', new Date('2000-01-31T12:00:00Z'))).toBe(false);
  });

  it('the day after is stale', () => {
    expect(isPastExpiry('2000-01-31', new Date('2000-02-01T12:00:00Z'))).toBe(true);
  });

  it('the boundary is Minsk, not UTC', () => {
    // 21:30 UTC on the 31st is already 00:30 on 1 February in Minsk.
    expect(isPastExpiry('2000-01-31', new Date('2000-01-31T21:30:00Z'))).toBe(true);
    expect(isPastExpiry('2000-01-31', new Date('2000-01-31T20:30:00Z'))).toBe(false);
  });

  it('an act with no stated end date never goes stale on a date', () => {
    expect(isPastExpiry(null, new Date('2099-01-01T12:00:00Z'))).toBe(false);
  });

  it('a malformed expiry does not silently hide the figure', () => {
    // Wrong here means refusing to act, not blanking the page on a typo.
    expect(isPastExpiry('31.01.2000', new Date('2099-01-01T12:00:00Z'))).toBe(false);
  });
});
