/**
 * Заведомо ненастоящие записи для тестов.
 *
 * Номера актов — `TEST-…`, цены — единицы BYN за грамм. Настоящая цена
 * золота на порядок выше, так что перепутать фикстуру с данными нельзя,
 * даже если она окажется не в том файле. Это проверяется отдельным тестом.
 */

import type { BullionRecord, TariffRecord } from '../../src/lib/schema.ts';

export const SOURCE_URL = 'https://minfin.gov.by/ru/activities_jewels/fund/pokupka/fizlic/';

/** Базовая корректная запись. Все прочие — её изменения. */
export function tariff(overrides: Partial<TariffRecord> = {}): TariffRecord {
  return {
    act_number: 'TEST-1',
    act_date: '2000-01-01',
    effective_from: '2000-01-10',
    stated_expiry: '2000-01-31',
    source_url: SOURCE_URL,
    transcribed_at: '2000-01-10T09:00:00Z',
    transcribed_by: 'тест',
    // Все девять проб, которые встречаются в акте. Значения различны,
    // чтобы тест «разные пробы дают разные суммы» что-то проверял.
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
