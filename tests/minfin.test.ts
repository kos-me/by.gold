/**
 * Парсер страницы Минфина.
 *
 * Все фикстуры собраны вручную: структура снята с живой страницы, числа
 * заведомо ненастоящие. Настоящий HTML в репозиторий не кладётся — см.
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
  if (!result.ok) throw new Error(`${name} не разобрался: ${result.reason} — ${result.detail}`);
  return result;
}

describe('обычная страница', () => {
  it('извлекает номер и дату акта', () => {
    const { act } = expectOk('current.html');
    expect(act.act_number).toBe('TEST-1');
    expect(act.act_date).toBe('2000-01-10');
  });

  it('извлекает все девять проб', () => {
    const { act } = expectOk('current.html');
    expect(Object.keys(act.prices_byn_per_gram).sort()).toEqual([
      '375', '500', '583', '585', '750', '900', '916', '950', '958',
    ]);
  });

  it('583 и 585 делят одну ячейку и одну цену', () => {
    const { act } = expectOk('current.html');
    expect(act.prices_byn_per_gram['583']).toBe(2.5);
    expect(act.prices_byn_per_gram['585']).toBe(2.5);
  });

  it('запятая как разделитель дробной части', () => {
    const { act } = expectOk('current.html');
    expect(act.prices_byn_per_gram['375']).toBe(1.0);
    expect(act.prices_byn_per_gram['958']).toBe(5.0);
  });

  it('не берёт цены из таблиц серебра, слитков и протезов', () => {
    const { act } = expectOk('current.html');
    // В фикстуре серебро 0,10–0,15, слитки 8,44, протезы 4,80.
    const values = Object.values(act.prices_byn_per_gram);
    expect(values).not.toContain(0.1);
    expect(values).not.toContain(8.44);
    expect(values).not.toContain(4.8);
  });

  it('на полной таблице предупреждений нет', () => {
    expect(expectOk('current.html').warnings).toEqual([]);
  });

  it('разобранное годится для записи в tariffs.json — кроме дат', () => {
    const { act } = expectOk('current.html');
    // Даты вступления в силу на странице нет: её вписывает человек из акта.
    const candidate = {
      ...act,
      effective_from: '2000-01-20',
      stated_expiry: null,
      source_url: 'https://minfin.gov.by/ru/activities_jewels/fund/pokupka/fizlic/',
      transcribed_at: '2000-01-20T09:00:00Z',
      transcribed_by: 'тест',
    };
    expect(validateTariffRecord(candidate).ok).toBe(true);
  });
});

describe('страница не менялась / вышел новый акт', () => {
  it('тот же акт новым не считается', () => {
    const { act } = expectOk('current.html');
    expect(isNewAct(act, { act_number: 'TEST-1', act_date: '2000-01-10' })).toBe(false);
  });

  it('другой номер — новый акт', () => {
    const { act } = expectOk('changed.html');
    expect(act.act_number).toBe('TEST-2');
    expect(isNewAct(act, { act_number: 'TEST-1', act_date: '2000-01-10' })).toBe(true);
  });

  it('тот же номер, но другая дата — тоже новый акт', () => {
    const { act } = expectOk('current.html');
    expect(isNewAct(act, { act_number: 'TEST-1', act_date: '1999-01-10' })).toBe(true);
  });

  it('первый запуск: известного акта нет — считается новым', () => {
    expect(isNewAct(expectOk('current.html').act, null)).toBe(true);
  });

  it('цены нового акта разобраны', () => {
    const { act } = expectOk('changed.html');
    expect(act.prices_byn_per_gram['585']).toBe(2.6);
    expect(act.prices_byn_per_gram['375']).toBe(1.05);
  });
});

describe('страница техобслуживания, отвечающая 200', () => {
  it('не разбирается — и это отказ, а не пустой результат', () => {
    const result = parsed('maintenance.html');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('no_act_line');
  });

  it('в объяснении сказано, что искали', () => {
    const result = parsed('maintenance.html');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.detail).toContain('постановлению');
  });

  it('пустой ответ тоже отказ', () => {
    const result = parseMinfinPage('', 'fixture:empty');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('empty_document');
  });
});

describe('архив вместо действующей страницы', () => {
  it('несколько актов — отказ, а не выбор наугад', () => {
    const result = parsed('archive.html');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('multiple_acts');
  });

  it('в объяснении перечислены найденные акты', () => {
    const result = parsed('archive.html');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.detail).toContain('TEST-1');
    expect(result.detail).toContain('TEST-3');
  });
});

describe('неполная таблица', () => {
  it('отсутствие пробы — предупреждение, а не отказ', () => {
    const result = expectOk('missing-fineness.html');
    expect(result.act.prices_byn_per_gram['585']).toBeDefined();
    expect(result.act.prices_byn_per_gram['583']).toBeUndefined();
    expect(result.warnings.map((w) => w.kind)).toContain('missing_fineness');
    expect(result.warnings.some((w) => w.message.includes('583'))).toBe(true);
  });
});

describe('крупные движения цены', () => {
  const previous = {
    '375': 1.0, '500': 2.0, '583': 2.5, '585': 2.5, '750': 4.0,
    '900': 4.5, '916': 4.7, '950': 4.9, '958': 5.0,
  } as const;

  it('движение больше 15% помечается, но данные принимаются', () => {
    const result = expectOk('big-move.html');
    const moves = checkPriceMoves(result.act.prices_byn_per_gram, previous);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((w) => w.kind === 'large_move')).toBe(true);
    // 2,50 → 3,20 это +28%
    expect(moves.some((w) => w.message.includes('583'))).toBe(true);
    expect(moves.some((w) => w.message.includes('585'))).toBe(true);
  });

  it('обычное движение не помечается', () => {
    const result = expectOk('changed.html');
    expect(checkPriceMoves(result.act.prices_byn_per_gram, previous)).toEqual([]);
  });

  it('без предыдущих цен сравнивать не с чем', () => {
    const result = expectOk('big-move.html');
    expect(checkPriceMoves(result.act.prices_byn_per_gram, null)).toEqual([]);
  });

  it('падение тоже помечается', () => {
    const moves = checkPriceMoves({ '585': 1.0 }, { '585': 2.5 });
    expect(moves).toHaveLength(1);
    expect(moves[0]?.message).toContain('-60,0%');
  });

  it('ровно на пороге не помечается, чуть выше — помечается', () => {
    expect(checkPriceMoves({ '585': 1.15 }, { '585': 1.0 })).toEqual([]);
    expect(checkPriceMoves({ '585': 1.16 }, { '585': 1.0 })).toHaveLength(1);
  });

  it('проба, которой не было раньше, движением не считается', () => {
    expect(checkPriceMoves({ '585': 9.0 }, { '375': 1.0 })).toEqual([]);
  });
});

describe('парсер не выдумывает', () => {
  it('битая цена — отказ, а не подстановка нуля', () => {
    const broken = fixture('current.html').replace('<td>2,50</td>', '<td>—</td>');
    const result = parseMinfinPage(broken, 'fixture:broken');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unparsable_price');
  });

  it('исчезла строка золота — отказ', () => {
    const broken = fixture('current.html').replace('Золото в изделиях и ломе', 'Нечто иное');
    const result = parseMinfinPage(broken, 'fixture:no-gold');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no_gold_row');
  });

  it('исчезла таблица — отказ', () => {
    const broken = fixture('current.html').replace(/ПРОБЫ/g, 'НЕЧТО');
    const result = parseMinfinPage(broken, 'fixture:no-table');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no_price_table');
  });

  it('число проб и число цен разошлось — отказ', () => {
    const broken = fixture('current.html').replace(
      '<tr><td>1.</td><td>Золото в изделиях и ломе</td><td>1,00</td>',
      '<tr><td>1.</td><td>Золото в изделиях и ломе</td>',
    );
    const result = parseMinfinPage(broken, 'fixture:short-row');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('column_mismatch');
  });

  it('дата вступления в силу и срок НЕ извлекаются — их нет на странице', () => {
    const { act } = expectOk('current.html');
    expect(act).not.toHaveProperty('effective_from');
    expect(act).not.toHaveProperty('stated_expiry');
  });
});
