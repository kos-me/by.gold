/**
 * Unmistakably fake records for tests.
 *
 * Act numbers are `TEST-…`, prices are single-digit BYN per gram. A real gold
 * price is orders of magnitude higher, so a fixture cannot be mistaken for
 * data even if it ends up in the wrong file. A dedicated test enforces this.
 */

import type { BullionRecord, TariffRecord } from '../../src/lib/schema.ts';

export const SOURCE_URL = 'https://minfin.gov.by/ru/activities_jewels/fund/pokupka/fizlic/';

/** The baseline valid record. Everything else is a variation on it. */
export function tariff(overrides: Partial<TariffRecord> = {}): TariffRecord {
  return {
    act_number: 'TEST-1',
    act_date: '2000-01-01',
    effective_from: '2000-01-10',
    stated_expiry: '2000-01-31',
    source_url: SOURCE_URL,
    transcribed_at: '2000-01-10T09:00:00Z',
    transcribed_by: 'test',
    // All nine finenesses that occur in the act. The values differ so the
    // "different finenesses give different sums" test asserts something.
    prices_byn_per_gram: {
      '375': 1.0,
      '500': 2.0,
      '583': 2.5,
      '585': 3.0,
      '750': 4.0,
      '900': 4.5,
      '916': 4.7,
      '950': 4.9,
      '958': 5.0,
    },
    ...overrides,
  };
}

export function bullionRecord(overrides: Partial<BullionRecord> = {}): BullionRecord {
  return {
    mass_grams: 1,
    fineness: '999.9',
    buyback_byn: 7.0,
    quoted_on: '2000-01-10',
    source_url: 'https://www.nbrb.by/',
    fetched_at: '2000-01-10T09:00:00Z',
    ...overrides,
  };
}
