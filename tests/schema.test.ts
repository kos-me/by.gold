import { describe, expect, it } from 'vitest';

import {
  validateBullionFile,
  validateStatusFile,
  validateTariffFile,
  validateTariffRecord,
  type ValidationIssue,
} from '../src/lib/schema.ts';
import { bullionRecord, tariff, SOURCE_URL } from './fixtures/records.ts';

/** The paths issues were found at — keeps the assertions short. */
function issuePaths(issues: readonly ValidationIssue[]): string[] {
  return issues.map((issue) => issue.path);
}

function expectRejected(input: unknown): readonly ValidationIssue[] {
  const result = validateTariffRecord(input);
  if (result.ok) throw new Error('record was accepted when it should have been rejected');
  return result.issues;
}

describe('validateTariffRecord — the three mandatory provenance fields', () => {
  it('accepts a complete, correct record', () => {
    const result = validateTariffRecord(tariff());
    expect(result.ok).toBe(true);
  });

  it('rejects a record with no act_number', () => {
    const { act_number: _omitted, ...withoutActNumber } = tariff();
    expect(issuePaths(expectRejected(withoutActNumber))).toContain('act_number');
  });

  it('rejects an empty or whitespace act_number', () => {
    expect(issuePaths(expectRejected(tariff({ act_number: '' })))).toContain('act_number');
    expect(issuePaths(expectRejected(tariff({ act_number: '   ' })))).toContain('act_number');
  });

  it('rejects a record with no effective_from', () => {
    const { effective_from: _omitted, ...withoutEffectiveFrom } = tariff();
    expect(issuePaths(expectRejected(withoutEffectiveFrom))).toContain('effective_from');
  });

  it('rejects an effective_from not in YYYY-MM-DD', () => {
    expect(issuePaths(expectRejected(tariff({ effective_from: '10.01.2000' })))).toContain(
      'effective_from',
    );
    expect(issuePaths(expectRejected(tariff({ effective_from: '2000-13-01' })))).toContain(
      'effective_from',
    );
    expect(issuePaths(expectRejected(tariff({ effective_from: '2001-02-29' })))).toContain(
      'effective_from',
    );
  });

  it('rejects a record with no source_url', () => {
    const { source_url: _omitted, ...withoutSource } = tariff();
    expect(issuePaths(expectRejected(withoutSource))).toContain('source_url');
  });

  it('rejects a source outside the official host list', () => {
    const issues = expectRejected(tariff({ source_url: 'https://news.example.by/gold-price' }));
    expect(issuePaths(issues)).toContain('source_url');
    expect(issues.map((i) => i.message).join(' ')).toContain('news.example.by');
  });

  it('accepts pravo.by and etalonline.by as act sources', () => {
    expect(validateTariffRecord(tariff({ source_url: 'https://pravo.by/document/?guid=1' })).ok).toBe(
      true,
    );
    expect(validateTariffRecord(tariff({ source_url: 'https://etalonline.by/document/' })).ok).toBe(
      true,
    );
  });

  it('rejects a non-link in source_url', () => {
    expect(issuePaths(expectRejected(tariff({ source_url: 'минфин, страница скупки' })))).toContain(
      'source_url',
    );
  });
});

describe('validateTariffRecord — stated_expiry', () => {
  it('accepts null: an act with no stated end date is ordinary', () => {
    const result = validateTariffRecord(tariff({ stated_expiry: null }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.stated_expiry).toBeNull();
  });

  it('requires the field to be present: absent ≠ null', () => {
    const { stated_expiry: _omitted, ...withoutExpiry } = tariff();
    const issues = expectRejected(withoutExpiry);
    expect(issuePaths(issues)).toContain('stated_expiry');
  });

  it('rejects an expiry earlier than the effective date', () => {
    const issues = expectRejected(
      tariff({ effective_from: '2000-01-10', stated_expiry: '2000-01-05' }),
    );
    expect(issuePaths(issues)).toContain('stated_expiry');
  });

  it('rejects a string that is neither a date nor null', () => {
    expect(issuePaths(expectRejected(tariff({ stated_expiry: 'бессрочно' as never })))).toContain(
      'stated_expiry',
    );
  });
});

describe('validateTariffRecord — prices', () => {
  it('rejects an empty price table', () => {
    expect(issuePaths(expectRejected(tariff({ prices_byn_per_gram: {} })))).toContain(
      'prices_byn_per_gram',
    );
  });

  it('accepts a partial fineness set: whichever the act names', () => {
    const result = validateTariffRecord(tariff({ prices_byn_per_gram: { '585': 3.0 } }));
    expect(result.ok).toBe(true);
  });

  it('rejects an unknown fineness', () => {
    const issues = expectRejected(
      tariff({ prices_byn_per_gram: { '585': 3.0, '999': 4.0 } as never }),
    );
    // 999 is absent from the scrap table — it is a bullion fineness, not an item's.
    expect(issuePaths(issues)).toContain('prices_byn_per_gram.999');
  });

  it('rejects a zero, negative or non-numeric price', () => {
    expect(issuePaths(expectRejected(tariff({ prices_byn_per_gram: { '585': 0 } })))).toContain(
      'prices_byn_per_gram.585',
    );
    expect(issuePaths(expectRejected(tariff({ prices_byn_per_gram: { '585': -3 } })))).toContain(
      'prices_byn_per_gram.585',
    );
    expect(
      issuePaths(expectRejected(tariff({ prices_byn_per_gram: { '585': '3.00' as never } }))),
    ).toContain('prices_byn_per_gram.585');
    expect(
      issuePaths(expectRejected(tariff({ prices_byn_per_gram: { '585': Number.NaN } }))),
    ).toContain('prices_byn_per_gram.585');
  });
});

describe('validateTariffRecord — transcription', () => {
  it('requires a transcription instant with a time zone', () => {
    expect(issuePaths(expectRejected(tariff({ transcribed_at: '2000-01-10' })))).toContain(
      'transcribed_at',
    );
    expect(issuePaths(expectRejected(tariff({ transcribed_at: '2000-01-10T09:00:00' })))).toContain(
      'transcribed_at',
    );
  });

  it('requires who did the transcribing', () => {
    expect(issuePaths(expectRejected(tariff({ transcribed_by: '' })))).toContain('transcribed_by');
  });

  it('rejects taking force before the act was adopted', () => {
    const issues = expectRejected(
      tariff({ act_date: '2000-01-10', effective_from: '2000-01-01' }),
    );
    expect(issuePaths(issues)).toContain('effective_from');
  });

  it('copies the record rather than returning the input object', () => {
    const input = tariff();
    const result = validateTariffRecord(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).not.toBe(input);
    expect(result.value.prices_byn_per_gram).not.toBe(input.prices_byn_per_gram);
  });

  it('trims whitespace in the act number and the link', () => {
    const result = validateTariffRecord(tariff({ act_number: '  TEST-1 ' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.act_number).toBe('TEST-1');
  });
});

describe('validateTariffFile', () => {
  it('accepts an empty array: a working state, not an error', () => {
    const result = validateTariffFile([]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('rejects a non-array', () => {
    expect(validateTariffFile({}).ok).toBe(false);
    expect(validateTariffFile(null).ok).toBe(false);
  });

  it('names the record index in the issue path', () => {
    const result = validateTariffFile([tariff(), tariff({ act_number: '' })]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(issuePaths(result.issues)).toContain('[1].act_number');
  });

  it('catches a duplicate act — a typical merge oversight', () => {
    const result = validateTariffFile([tariff(), tariff()]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((i) => i.message.includes('already present as record [0]'))).toBe(true);
  });

  it('different acts sharing a number but not a date are not duplicates', () => {
    const result = validateTariffFile([
      tariff({ act_number: 'TEST-1', effective_from: '2000-01-10', stated_expiry: '2000-01-31' }),
      tariff({
        act_number: 'TEST-1',
        act_date: '2001-01-01',
        effective_from: '2001-01-10',
        stated_expiry: '2001-01-31',
      }),
    ]);
    expect(result.ok).toBe(true);
  });
});

describe('validateBullionFile', () => {
  it('accepts an empty array', () => {
    expect(validateBullionFile([]).ok).toBe(true);
  });

  it('accepts a valid National Bank record', () => {
    expect(validateBullionFile([bullionRecord()]).ok).toBe(true);
  });

  it('takes bullion prices from nowhere but nbrb.by', () => {
    const result = validateBullionFile([bullionRecord({ source_url: SOURCE_URL })]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(issuePaths(result.issues)).toContain('[0].source_url');
  });
});

describe('validateStatusFile', () => {
  it('accepts null: no check has happened yet', () => {
    const result = validateStatusFile({ last_checked: null, last_checked_source: null });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.last_checked).toBeNull();
  });

  it('requires a time zone on the check instant', () => {
    expect(validateStatusFile({ last_checked: '2000-01-10', last_checked_source: null }).ok).toBe(
      false,
    );
  });
});

describe('validateTariffRecord — transcribed_from', () => {
  it('is optional: omitted means the act itself was read', () => {
    const result = validateTariffRecord(tariff());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.transcribed_from).toBeUndefined();
  });

  it("accepts 'archive' when no expiry is stated", () => {
    const result = validateTariffRecord(
      tariff({ transcribed_from: 'archive', stated_expiry: null }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.transcribed_from).toBe('archive');
  });

  it('rejects an archive record that states an expiry', () => {
    // The archive pages carry no act text, so a date here could only have come
    // from somewhere unrecorded.
    const issues = expectRejected(
      tariff({ transcribed_from: 'archive', stated_expiry: '2000-01-31' }),
    );
    expect(issuePaths(issues)).toContain('stated_expiry');
  });

  it('rejects any other value', () => {
    expect(
      issuePaths(expectRejected(tariff({ transcribed_from: 'news' as never }))),
    ).toContain('transcribed_from');
  });

  it("accepts an explicit 'act' with a stated expiry", () => {
    expect(validateTariffRecord(tariff({ transcribed_from: 'act' })).ok).toBe(true);
  });
});
