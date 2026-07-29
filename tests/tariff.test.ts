/**
 * Tariff state. The clock is injected in every test — behaviour at the expiry
 * boundary must be testable, not observable once a month.
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

/** Injected clock: noon Minsk time on the given date. */
function clock(isoDate: string): Date {
  return new Date(`${isoDate}T09:00:00Z`); // 12:00 in Minsk
}

describe('an empty file — the unavailable state', () => {
  const state = resolveTariffState([], clock('2000-01-15'));

  it('status unavailable', () => {
    expect(state.status).toBe('unavailable');
    expect(state.reason).toBe('no_records');
  });

  it('nothing to show and nothing to archive', () => {
    expect(state.current).toBeNull();
    expect(state.lastKnown).toBeNull();
    expect(state.history).toEqual([]);
  });

  it('the calculator is off', () => {
    expect(isCalculatorEnabled(state)).toBe(false);
  });

  it('invents no expiry date', () => {
    expect(state.daysSinceExpiry).toBeNull();
  });
});

describe('a decree in force — the valid state', () => {
  const record = tariff({ effective_from: '2000-01-10', stated_expiry: '2000-01-31' });

  it('inside the period', () => {
    const state = resolveTariffState([record], clock('2000-01-15'));
    expect(state.status).toBe('valid');
    expect(state.reason).toBe('in_force_until');
    expect(state.current).toEqual(record);
    expect(isCalculatorEnabled(state)).toBe(true);
  });

  it('on the first day of force', () => {
    expect(resolveTariffState([record], clock('2000-01-10')).status).toBe('valid');
  });

  it("on the last day — \'through the 31st\' includes the 31st", () => {
    const state = resolveTariffState([record], clock('2000-01-31'));
    expect(state.status).toBe('valid');
    expect(state.current).toEqual(record);
  });

  it('the day before it takes force there is no figure yet', () => {
    const state = resolveTariffState([record], clock('2000-01-09'));
    expect(state.status).toBe('unavailable');
    expect(state.reason).toBe('not_yet_effective');
    expect(state.upcoming).toEqual(record);
    expect(isCalculatorEnabled(state)).toBe(false);
  });

  it('the day after the period ends there is none', () => {
    const state = resolveTariffState([record], clock('2000-02-01'));
    expect(state.status).toBe('review_required');
  });
});

describe('expired with no successor — the review_required state', () => {
  const record = tariff({ effective_from: '2000-01-10', stated_expiry: '2000-01-31' });
  const state = resolveTariffState([record], clock('2000-02-05'));

  it('status review_required', () => {
    expect(state.status).toBe('review_required');
    expect(state.reason).toBe('expired_no_successor');
  });

  it('it must not be computed against', () => {
    expect(state.current).toBeNull();
    expect(isCalculatorEnabled(state)).toBe(false);
  });

  it('the last known record is kept — for the archive', () => {
    expect(state.lastKnown).toEqual(record);
  });

  it('counts the days since expiry', () => {
    expect(state.daysSinceExpiry).toBe(5);
  });

  it('the first day after expiry is one day', () => {
    expect(resolveTariffState([record], clock('2000-02-01')).daysSinceExpiry).toBe(1);
  });
});

describe('an act with no stated end date', () => {
  const openEnded = tariff({ effective_from: '2000-01-10', stated_expiry: null });

  it('still in force a year later — until replaced, not until a date', () => {
    const state = resolveTariffState([openEnded], clock('2001-06-01'));
    expect(state.status).toBe('valid');
    expect(state.reason).toBe('in_force_no_expiry');
    expect(isCalculatorEnabled(state)).toBe(true);
  });

  it('does not turn into an expiry date', () => {
    const state = resolveTariffState([openEnded], clock('2001-06-01'));
    expect(state.current?.stated_expiry).toBeNull();
    expect(state.daysSinceExpiry).toBeNull();
  });

  it('superseded by a later act that has an end date', () => {
    const successor = tariff({
      act_number: 'TEST-2',
      act_date: '2000-02-01',
      effective_from: '2000-02-10',
      stated_expiry: '2000-02-28',
    });
    const state = resolveTariffState([openEnded, successor], clock('2000-02-15'));
    expect(state.current?.act_number).toBe('TEST-2');
  });

  it('does not revive when its successor expires — review_required', () => {
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

describe('a successor is published', () => {
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

  it('switches to the new act without a gap', () => {
    const state = resolveTariffState([first, second], clock('2000-02-01'));
    expect(state.status).toBe('valid');
    expect(state.current?.act_number).toBe('TEST-2');
  });

  it('until the successor takes force the previous one holds', () => {
    const state = resolveTariffState([first, second], clock('2000-01-20'));
    expect(state.current?.act_number).toBe('TEST-1');
    expect(state.upcoming?.act_number).toBe('TEST-2');
  });

  it('a gap between acts gives review_required, not the old figure', () => {
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

  it('record order in the file does not affect the result', () => {
    const forward = resolveTariffState([first, second], clock('2000-02-05'));
    const reversed = resolveTariffState([second, first], clock('2000-02-05'));
    expect(reversed).toEqual(forward);
  });
});

describe('history', () => {
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

  it('newest records first', () => {
    const state = resolveTariffState(records, clock('2000-03-15'));
    expect(state.history.map((r) => r.act_number)).toEqual(['TEST-3', 'TEST-2', 'TEST-1']);
  });

  it('future records stay out of history', () => {
    const state = resolveTariffState(records, clock('2000-02-15'));
    expect(state.history.map((r) => r.act_number)).toEqual(['TEST-2', 'TEST-1']);
  });

  it('history survives into the review_required state', () => {
    const state = resolveTariffState(records, clock('2000-04-10'));
    expect(state.status).toBe('review_required');
    expect(state.history).toHaveLength(3);
  });

  it('the sparkline series runs oldest to newest', () => {
    const state = resolveTariffState(records, clock('2000-03-15'));
    expect(priceSeries(state, '585').map((p) => p.record.act_number)).toEqual([
      'TEST-1',
      'TEST-2',
      'TEST-3',
    ]);
  });

  it('a record lacking the fineness drops out rather than being interpolated', () => {
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

describe('the day boundary is computed in Minsk', () => {
  const record = tariff({ effective_from: '2000-01-10', stated_expiry: '2000-01-31' });

  it('at 23:30 Minsk time on the 31st it is still in force', () => {
    // 20:30 UTC = 23:30 in Minsk, still 31 January.
    expect(resolveTariffState([record], new Date('2000-01-31T20:30:00Z')).status).toBe('valid');
  });

  it('at 00:30 Minsk time on 1 February it is not', () => {
    // 21:30 UTC on 31 January = 00:30 on 1 February in Minsk.
    const state = resolveTariffState([record], new Date('2000-01-31T21:30:00Z'));
    expect(state.status).toBe('review_required');
    expect(state.asOf).toBe('2000-02-01');
  });
});

describe('price access', () => {
  const record = tariff();

  it('finenesses come back in canonical order', () => {
    expect(finenessesOf(record)).toEqual([
      '375', '500', '583', '585', '750', '900', '916', '950', '958',
    ]);
  });

  it('only the finenesses the act names come back', () => {
    const partial = tariff({ prices_byn_per_gram: { '958': 5.0, '583': 2.5 } });
    expect(finenessesOf(partial)).toEqual(['583', '958']);
  });

  it('a missing fineness gives null, not zero and not a substitute', () => {
    const partial = tariff({ prices_byn_per_gram: { '585': 3.0 } });
    expect(priceFor(partial, '585')).toBe(3.0);
    expect(priceFor(partial, '750')).toBeNull();
  });

  it('the headline is 585 when the act names it', () => {
    expect(headlinePrice(record)).toEqual({ fineness: '585', price: 3.0 });
  });

  it('with no 585 in the act, the first available fineness, not an invented one', () => {
    const partial = tariff({ prices_byn_per_gram: { '750': 4.0, '958': 5.0 } });
    expect(headlinePrice(partial)).toEqual({ fineness: '750', price: 4.0 });
  });
});

describe('archive records are history and never the figure in force', () => {
  /*
   * The guarantee this suite exists for: importing history cannot change what
   * the site shows as the current price. An archive record's expiry was never
   * read, so it must never decide whether a figure is in force.
   */
  const archived = tariff({
    act_number: 'TEST-ARCHIVE',
    act_date: '2000-01-01',
    effective_from: '2000-01-10',
    stated_expiry: null,
    transcribed_from: 'archive',
    prices_byn_per_gram: { '585': 1.5 },
  });
  const fromAct = tariff({
    act_number: 'TEST-ACT',
    act_date: '2000-02-01',
    effective_from: '2000-02-10',
    stated_expiry: '2000-02-28',
  });

  it('an archive record alone shows no figure, even though it has taken force', () => {
    const state = resolveTariffState([archived], clock('2000-01-15'));
    expect(state.status).toBe('unavailable');
    expect(state.current).toBeNull();
    expect(state.lastKnown).toBeNull();
    expect(isCalculatorEnabled(state)).toBe(false);
  });

  it('archive-only data reads as "no records", not as "not in force yet"', () => {
    // There is no act it could ever show, which is the same position as an
    // empty file — not a promise that something is coming.
    expect(resolveTariffState([archived], clock('2000-01-15')).reason).toBe('no_records');
  });

  it('but it still appears in history, which is the whole point', () => {
    const state = resolveTariffState([archived], clock('2000-01-15'));
    expect(state.history.map((r) => r.act_number)).toEqual(['TEST-ARCHIVE']);
    expect(priceSeries(state, '585').map((e) => e.price)).toEqual([1.5]);
  });

  it('a later act from the act itself is what governs', () => {
    const state = resolveTariffState([archived, fromAct], clock('2000-02-15'));
    expect(state.status).toBe('valid');
    expect(state.current?.act_number).toBe('TEST-ACT');
    expect(state.history.map((r) => r.act_number)).toEqual(['TEST-ACT', 'TEST-ARCHIVE']);
  });

  it('an archive record cannot become the last known figure when the act expires', () => {
    // Once TEST-ACT lapses the site withholds the figure and shows the last
    // known one as an archive. That must be TEST-ACT, whose period was read,
    // and never the archive record behind it.
    const state = resolveTariffState([archived, fromAct], clock('2000-03-15'));
    expect(state.status).toBe('review_required');
    expect(state.lastKnown?.act_number).toBe('TEST-ACT');
  });

  it('an archive record is never announced as upcoming', () => {
    const future = tariff({
      act_number: 'TEST-FUTURE',
      effective_from: '2000-06-01',
      stated_expiry: null,
      transcribed_from: 'archive',
    });
    expect(resolveTariffState([future], clock('2000-01-15')).upcoming).toBeNull();
  });

  it('an archive record cannot resurrect a figure after a real act has lapsed', () => {
    // The dangerous ordering: the archive record takes force last. If it were
    // allowed to govern, an open-ended record with an unread expiry would show
    // a figure for ever.
    const later = tariff({
      act_number: 'TEST-ARCHIVE-LATER',
      act_date: '2000-03-01',
      effective_from: '2000-03-05',
      stated_expiry: null,
      transcribed_from: 'archive',
    });
    const state = resolveTariffState([fromAct, later], clock('2000-04-01'));
    expect(state.status).toBe('review_required');
    expect(state.current).toBeNull();
  });
});
