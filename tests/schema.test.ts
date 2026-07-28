import { describe, expect, it } from 'vitest';

import {
  validateBullionFile,
  validateStatusFile,
  validateTariffFile,
  validateTariffRecord,
  type ValidationIssue,
} from '../src/lib/schema.ts';
import { bullionRecord, tariff, SOURCE_URL } from './fixtures/records.ts';

/** Пути, по которым нашлись замечания — так тесты читаются короче. */
function issuePaths(issues: readonly ValidationIssue[]): string[] {
  return issues.map((issue) => issue.path);
}

function expectRejected(input: unknown): readonly ValidationIssue[] {
  const result = validateTariffRecord(input);
  if (result.ok) throw new Error('запись принята, хотя должна была быть отвергнута');
  return result.issues;
}

describe('validateTariffRecord — три обязательных поля происхождения', () => {
  it('принимает полную корректную запись', () => {
    const result = validateTariffRecord(tariff());
    expect(result.ok).toBe(true);
  });

  it('отвергает запись без act_number', () => {
    const { act_number: _omitted, ...withoutActNumber } = tariff();
    expect(issuePaths(expectRejected(withoutActNumber))).toContain('act_number');
  });

  it('отвергает пустой и пробельный act_number', () => {
    expect(issuePaths(expectRejected(tariff({ act_number: '' })))).toContain('act_number');
    expect(issuePaths(expectRejected(tariff({ act_number: '   ' })))).toContain('act_number');
  });

  it('отвергает запись без effective_from', () => {
    const { effective_from: _omitted, ...withoutEffectiveFrom } = tariff();
    expect(issuePaths(expectRejected(withoutEffectiveFrom))).toContain('effective_from');
  });

  it('отвергает effective_from не в формате YYYY-MM-DD', () => {
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

  it('отвергает запись без source_url', () => {
    const { source_url: _omitted, ...withoutSource } = tariff();
    expect(issuePaths(expectRejected(withoutSource))).toContain('source_url');
  });

  it('отвергает источник вне списка официальных хостов', () => {
    const issues = expectRejected(tariff({ source_url: 'https://news.example.by/gold-price' }));
    expect(issuePaths(issues)).toContain('source_url');
    expect(issues.map((i) => i.message).join(' ')).toContain('news.example.by');
  });

  it('принимает pravo.by и etalonline.by как источник акта', () => {
    expect(validateTariffRecord(tariff({ source_url: 'https://pravo.by/document/?guid=1' })).ok).toBe(
      true,
    );
    expect(validateTariffRecord(tariff({ source_url: 'https://etalonline.by/document/' })).ok).toBe(
      true,
    );
  });

  it('отвергает не-ссылку в source_url', () => {
    expect(issuePaths(expectRejected(tariff({ source_url: 'минфин, страница скупки' })))).toContain(
      'source_url',
    );
  });
});

describe('validateTariffRecord — stated_expiry', () => {
  it('принимает null: акт без названного срока — обычное дело', () => {
    const result = validateTariffRecord(tariff({ stated_expiry: null }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.stated_expiry).toBeNull();
  });

  it('требует, чтобы поле присутствовало: отсутствие ≠ null', () => {
    const { stated_expiry: _omitted, ...withoutExpiry } = tariff();
    const issues = expectRejected(withoutExpiry);
    expect(issuePaths(issues)).toContain('stated_expiry');
  });

  it('отвергает срок раньше вступления в силу', () => {
    const issues = expectRejected(
      tariff({ effective_from: '2000-01-10', stated_expiry: '2000-01-05' }),
    );
    expect(issuePaths(issues)).toContain('stated_expiry');
  });

  it('отвергает строку, которая не дата и не null', () => {
    expect(issuePaths(expectRejected(tariff({ stated_expiry: 'бессрочно' as never })))).toContain(
      'stated_expiry',
    );
  });
});

describe('validateTariffRecord — цены', () => {
  it('отвергает пустую таблицу цен', () => {
    expect(issuePaths(expectRejected(tariff({ prices_byn_per_gram: {} })))).toContain(
      'prices_byn_per_gram',
    );
  });

  it('принимает неполный набор проб: какие пробы назвал акт, такие и есть', () => {
    const result = validateTariffRecord(tariff({ prices_byn_per_gram: { '585': 3.0 } }));
    expect(result.ok).toBe(true);
  });

  it('отвергает неизвестную пробу', () => {
    const issues = expectRejected(
      tariff({ prices_byn_per_gram: { '585': 3.0, '900': 4.0 } as never }),
    );
    expect(issuePaths(issues)).toContain('prices_byn_per_gram.900');
  });

  it('отвергает нулевую, отрицательную и нечисловую цену', () => {
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

describe('validateTariffRecord — перенос', () => {
  it('требует момент переноса с часовым поясом', () => {
    expect(issuePaths(expectRejected(tariff({ transcribed_at: '2000-01-10' })))).toContain(
      'transcribed_at',
    );
    expect(issuePaths(expectRejected(tariff({ transcribed_at: '2000-01-10T09:00:00' })))).toContain(
      'transcribed_at',
    );
  });

  it('требует, чтобы было указано, кто переносил', () => {
    expect(issuePaths(expectRejected(tariff({ transcribed_by: '' })))).toContain('transcribed_by');
  });

  it('отвергает вступление в силу раньше принятия акта', () => {
    const issues = expectRejected(
      tariff({ act_date: '2000-01-10', effective_from: '2000-01-01' }),
    );
    expect(issuePaths(issues)).toContain('effective_from');
  });

  it('копирует запись, а не отдаёт ссылку на входной объект', () => {
    const input = tariff();
    const result = validateTariffRecord(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).not.toBe(input);
    expect(result.value.prices_byn_per_gram).not.toBe(input.prices_byn_per_gram);
  });

  it('обрезает пробелы в номере акта и ссылке', () => {
    const result = validateTariffRecord(tariff({ act_number: '  TEST-1 ' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.act_number).toBe('TEST-1');
  });
});

describe('validateTariffFile', () => {
  it('принимает пустой массив: это рабочее состояние, а не ошибка', () => {
    const result = validateTariffFile([]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('отвергает не-массив', () => {
    expect(validateTariffFile({}).ok).toBe(false);
    expect(validateTariffFile(null).ok).toBe(false);
  });

  it('указывает индекс записи в пути замечания', () => {
    const result = validateTariffFile([tariff(), tariff({ act_number: '' })]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(issuePaths(result.issues)).toContain('[1].act_number');
  });

  it('ловит дубликат акта — типичный недосмотр при слиянии', () => {
    const result = validateTariffFile([tariff(), tariff()]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((i) => i.message.includes('уже есть в записи [0]'))).toBe(true);
  });

  it('разные акты с одним номером, но разными датами — не дубликат', () => {
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
  it('принимает пустой массив', () => {
    expect(validateBullionFile([]).ok).toBe(true);
  });

  it('принимает корректную запись НБРБ', () => {
    expect(validateBullionFile([bullionRecord()]).ok).toBe(true);
  });

  it('не берёт цены слитков ниоткуда, кроме nbrb.by', () => {
    const result = validateBullionFile([bullionRecord({ source_url: SOURCE_URL })]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(issuePaths(result.issues)).toContain('[0].source_url');
  });
});

describe('validateStatusFile', () => {
  it('принимает null: проверок ещё не было', () => {
    const result = validateStatusFile({ last_checked: null, last_checked_source: null });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.last_checked).toBeNull();
  });

  it('требует часовой пояс у момента проверки', () => {
    expect(validateStatusFile({ last_checked: '2000-01-10', last_checked_source: null }).ok).toBe(
      false,
    );
  });
});
