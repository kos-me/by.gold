/**
 * The Minfin page parser.
 *
 * Every fixture is hand-built: the structure comes from the live page, the
 * numbers are unmistakably fake. The real HTML is never committed — see
 * tests/fixtures/minfin/README.md.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  checkPriceMoves,
  isNewAct,
  parseMinfinPage,
  type ParseResult,
} from '../worker/src/minfin.ts';
import { validateTariffRecord } from '../src/lib/schema.ts';

function fixture(name: string): string {
  return readFileSync(resolve(import.meta.dirname, 'fixtures/minfin', name), 'utf8');
}

function parsed(name: string): ParseResult {
  return parseMinfinPage(fixture(name), `fixture:${name}`);
}

function expectOk(name: string) {
  const result = parsed(name);
  if (!result.ok) throw new Error(`${name} did not parse: ${result.reason} — ${result.detail}`);
  return result;
}

describe('an ordinary page', () => {
  it('extracts the act number and date', () => {
    const { act } = expectOk('current.html');
    expect(act.act_number).toBe('TEST-1');
    expect(act.act_date).toBe('2000-01-10');
  });

  it('extracts all nine finenesses', () => {
    const { act } = expectOk('current.html');
    expect(Object.keys(act.prices_byn_per_gram).sort()).toEqual([
      '375', '500', '583', '585', '750', '900', '916', '950', '958',
    ]);
  });

  it('583 and 585 share one cell and one price', () => {
    const { act } = expectOk('current.html');
    expect(act.prices_byn_per_gram['583']).toBe(2.5);
    expect(act.prices_byn_per_gram['585']).toBe(2.5);
  });

  it('comma as the decimal separator', () => {
    const { act } = expectOk('current.html');
    expect(act.prices_byn_per_gram['375']).toBe(1.0);
    expect(act.prices_byn_per_gram['958']).toBe(5.0);
  });

  it('takes no prices from the silver, bullion or dental tables', () => {
    const { act } = expectOk('current.html');
    // In the fixture silver is 0.10–0.15, bullion 8.44, dental 4.80.
    const values = Object.values(act.prices_byn_per_gram);
    expect(values).not.toContain(0.1);
    expect(values).not.toContain(8.44);
    expect(values).not.toContain(4.8);
  });

  it('a complete table raises no warnings', () => {
    expect(expectOk('current.html').warnings).toEqual([]);
  });

  it('the parse fits a tariffs.json record — except the dates', () => {
    const { act } = expectOk('current.html');
    // The page carries no effective date: a person fills it in from the act.
    const candidate = {
      ...act,
      effective_from: '2000-01-20',
      stated_expiry: null,
      source_url: 'https://minfin.gov.by/ru/activities_jewels/fund/pokupka/fizlic/',
      transcribed_at: '2000-01-20T09:00:00Z',
      transcribed_by: 'test',
    };
    expect(validateTariffRecord(candidate).ok).toBe(true);
  });
});

describe('page unchanged / a new act appeared', () => {
  it('the same act does not count as new', () => {
    const { act } = expectOk('current.html');
    expect(isNewAct(act, { act_number: 'TEST-1', act_date: '2000-01-10' })).toBe(false);
  });

  it('a different number means a new act', () => {
    const { act } = expectOk('changed.html');
    expect(act.act_number).toBe('TEST-2');
    expect(isNewAct(act, { act_number: 'TEST-1', act_date: '2000-01-10' })).toBe(true);
  });

  it('same number, different date — also a new act', () => {
    const { act } = expectOk('current.html');
    expect(isNewAct(act, { act_number: 'TEST-1', act_date: '1999-01-10' })).toBe(true);
  });

  it('first run: no known act, so it counts as new', () => {
    expect(isNewAct(expectOk('current.html').act, null)).toBe(true);
  });

  it("the new act's prices are parsed", () => {
    const { act } = expectOk('changed.html');
    expect(act.prices_byn_per_gram['585']).toBe(2.6);
    expect(act.prices_byn_per_gram['375']).toBe(1.05);
  });
});

describe('a maintenance page answering 200', () => {
  it('does not parse — and that is a refusal, not an empty result', () => {
    const result = parsed('maintenance.html');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('no_act_line');
  });

  it('the explanation says what was looked for', () => {
    const result = parsed('maintenance.html');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.detail).toContain('постановлению');
  });

  it('an empty response is a refusal too', () => {
    const result = parseMinfinPage('', 'fixture:empty');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('empty_document');
  });
});

describe('the archive instead of the page in force', () => {
  it('several acts means refusal, not a guess', () => {
    const result = parsed('archive.html');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('multiple_acts');
  });

  it('the explanation lists the acts it found', () => {
    const result = parsed('archive.html');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.detail).toContain('TEST-1');
    expect(result.detail).toContain('TEST-3');
  });
});

describe('an incomplete table', () => {
  it('a missing fineness warns rather than refuses', () => {
    const result = expectOk('missing-fineness.html');
    expect(result.act.prices_byn_per_gram['585']).toBeDefined();
    expect(result.act.prices_byn_per_gram['583']).toBeUndefined();
    expect(result.warnings.map((w) => w.kind)).toContain('missing_fineness');
    expect(result.warnings.some((w) => w.message.includes('583'))).toBe(true);
  });
});

describe('large price moves', () => {
  const previous = {
    '375': 1.0, '500': 2.0, '583': 2.5, '585': 2.5, '750': 4.0,
    '900': 4.5, '916': 4.7, '950': 4.9, '958': 5.0,
  } as const;

  it('a move above 15% is flagged but the data is accepted', () => {
    const result = expectOk('big-move.html');
    const moves = checkPriceMoves(result.act.prices_byn_per_gram, previous);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((w) => w.kind === 'large_move')).toBe(true);
    // 2.50 → 3.20 is +28%
    expect(moves.some((w) => w.message.includes('583'))).toBe(true);
    expect(moves.some((w) => w.message.includes('585'))).toBe(true);
  });

  it('an ordinary move is not flagged', () => {
    const result = expectOk('changed.html');
    expect(checkPriceMoves(result.act.prices_byn_per_gram, previous)).toEqual([]);
  });

  it('with no previous prices there is nothing to compare', () => {
    const result = expectOk('big-move.html');
    expect(checkPriceMoves(result.act.prices_byn_per_gram, null)).toEqual([]);
  });

  it('a fall is flagged too', () => {
    const moves = checkPriceMoves({ '585': 1.0 }, { '585': 2.5 });
    expect(moves).toHaveLength(1);
    expect(moves[0]?.message).toContain('-60,0%');
  });

  it('exactly at the threshold is not flagged; just above it is', () => {
    expect(checkPriceMoves({ '585': 1.15 }, { '585': 1.0 })).toEqual([]);
    expect(checkPriceMoves({ '585': 1.16 }, { '585': 1.0 })).toHaveLength(1);
  });

  it('a fineness absent before does not count as a move', () => {
    expect(checkPriceMoves({ '585': 9.0 }, { '375': 1.0 })).toEqual([]);
  });
});

describe('the parser invents nothing', () => {
  it('a broken price refuses rather than substituting zero', () => {
    const broken = fixture('current.html').replace('<td>2,50</td>', '<td>—</td>');
    const result = parseMinfinPage(broken, 'fixture:broken');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unparsable_price');
  });

  it('the gold row vanished — refusal', () => {
    const broken = fixture('current.html').replace('Золото в изделиях и ломе', 'Нечто иное');
    const result = parseMinfinPage(broken, 'fixture:no-gold');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no_gold_row');
  });

  it('the table vanished — refusal', () => {
    const broken = fixture('current.html').replace(/ПРОБЫ/g, 'НЕЧТО');
    const result = parseMinfinPage(broken, 'fixture:no-table');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no_price_table');
  });

  it('fineness count and price count disagree — refusal', () => {
    const broken = fixture('current.html').replace(
      '<tr><td>1.</td><td>Золото в изделиях и ломе</td><td>1,00</td>',
      '<tr><td>1.</td><td>Золото в изделиях и ломе</td>',
    );
    const result = parseMinfinPage(broken, 'fixture:short-row');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('column_mismatch');
  });

  it('the effective and expiry dates are NOT extracted — the page lacks them', () => {
    const { act } = expectOk('current.html');
    expect(act).not.toHaveProperty('effective_from');
    expect(act).not.toHaveProperty('stated_expiry');
  });
});
