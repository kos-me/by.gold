/**
 * Проверки границы между настоящими данными и тестовыми.
 *
 * Этот тест — не про логику, а про единственную ошибку, ради предотвращения
 * которой затеян проект: правдоподобная выдуманная цифра, случайно попавшая
 * в продакшен. Он следит за обеими сторонами границы.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  formatIssues,
  validateBullionFile,
  validateStatusFile,
  validateTariffFile,
} from '../src/lib/schema.ts';
import { resolveTariffState } from '../src/lib/tariff.ts';
import { bullionRecord, tariff } from './fixtures/records.ts';

const ROOT = resolve(import.meta.dirname, '..');
const DATA_DIR = resolve(ROOT, 'data');
const SRC_DIR = resolve(ROOT, 'src');

function readDataFile(name: string): unknown {
  return JSON.parse(readFileSync(resolve(DATA_DIR, name), 'utf8')) as unknown;
}

function walk(dir: string, extensions: readonly string[]): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...walk(path, extensions));
    else if (extensions.some((ext) => entry.endsWith(ext))) found.push(path);
  }
  return found;
}

describe('data/ проходит собственную схему', () => {
  it('tariffs.json', () => {
    const result = validateTariffFile(readDataFile('tariffs.json'));
    if (!result.ok) throw new Error(`data/tariffs.json:\n${formatIssues(result.issues)}`);
    expect(result.ok).toBe(true);
  });

  it('bullion.json', () => {
    const result = validateBullionFile(readDataFile('bullion.json'));
    if (!result.ok) throw new Error(`data/bullion.json:\n${formatIssues(result.issues)}`);
    expect(result.ok).toBe(true);
  });

  it('status.json', () => {
    const result = validateStatusFile(readDataFile('status.json'));
    if (!result.ok) throw new Error(`data/status.json:\n${formatIssues(result.issues)}`);
    expect(result.ok).toBe(true);
  });
});

describe('в data/ не должно быть тестовых записей', () => {
  const raw = readFileSync(resolve(DATA_DIR, 'tariffs.json'), 'utf8');

  it('ни одного признака фикстуры в файле', () => {
    for (const marker of ['TEST-', 'FIXTURE', 'example.com', 'example.by', 'заглушка', 'placeholder']) {
      expect(raw.toLowerCase()).not.toContain(marker.toLowerCase());
    }
  });

  it('никто не переносил цифры под именем «тест»', () => {
    const result = validateTariffFile(readDataFile('tariffs.json'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const record of result.value) {
      expect(record.transcribed_by.toLowerCase()).not.toMatch(/^(тест|test)$/);
      expect(record.act_number.toUpperCase()).not.toMatch(/^TEST/);
    }
  });

  it('в каталоге data/ лежат только известные файлы', () => {
    const allowed = new Set(['tariffs.json', 'bullion.json', 'status.json', 'README.md']);
    for (const entry of readdirSync(DATA_DIR)) {
      expect(allowed.has(entry), `неожиданный файл в data/: ${entry}`).toBe(true);
    }
  });
});

describe('фикстуры остаются заведомо ненастоящими', () => {
  it('номер акта помечен как тестовый', () => {
    expect(tariff().act_number).toMatch(/^TEST-/);
  });

  it('цены на порядок ниже любой настоящей — спутать нельзя', () => {
    // Реальная цена золота 585 пробы — сотни BYN за грамм. Всё, что здесь,
    // должно быть единицами: правдоподобная фикстура опаснее сломанного теста.
    for (const price of Object.values(tariff().prices_byn_per_gram)) {
      expect(price).toBeLessThan(10);
    }
    expect(bullionRecord().buyback_byn).toBeLessThan(10);
  });

  it('даты фикстур — 2000 год, а не текущий', () => {
    expect(tariff().effective_from.startsWith('2000-')).toBe(true);
  });
});

describe('каталоги фикстур пригодны и заведомо ненастоящие', () => {
  const DIRS = ['valid-state', 'expired-state'] as const;

  it.each(DIRS)('%s проходит схему', (dir) => {
    const base = resolve(import.meta.dirname, 'fixtures', dir);
    const tariffResult = validateTariffFile(
      JSON.parse(readFileSync(resolve(base, 'tariffs.json'), 'utf8')) as unknown,
    );
    if (!tariffResult.ok) throw new Error(`${dir}/tariffs.json:\n${formatIssues(tariffResult.issues)}`);

    const bullionResult = validateBullionFile(
      JSON.parse(readFileSync(resolve(base, 'bullion.json'), 'utf8')) as unknown,
    );
    if (!bullionResult.ok) throw new Error(`${dir}/bullion.json:\n${formatIssues(bullionResult.issues)}`);

    const statusResult = validateStatusFile(
      JSON.parse(readFileSync(resolve(base, 'status.json'), 'utf8')) as unknown,
    );
    if (!statusResult.ok) throw new Error(`${dir}/status.json:\n${formatIssues(statusResult.issues)}`);
  });

  it.each(DIRS)('%s: номера актов помечены TEST-, цены — единицы BYN', (dir) => {
    const base = resolve(import.meta.dirname, 'fixtures', dir);
    const result = validateTariffFile(
      JSON.parse(readFileSync(resolve(base, 'tariffs.json'), 'utf8')) as unknown,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const record of result.value) {
      expect(record.act_number).toMatch(/^TEST-/);
      for (const price of Object.values(record.prices_byn_per_gram)) {
        expect(price, `${dir}: цена ${price} слишком похожа на настоящую`).toBeLessThan(10);
      }
    }
  });

  it('valid-state действительно даёт состояние valid, а expired-state — review_required', () => {
    // Проверяется на «сейчас»: срок у valid-state доведён до 2099 года
    // именно затем, чтобы фикстура не протухла молча.
    const load = (dir: string) =>
      validateTariffFile(
        JSON.parse(
          readFileSync(resolve(import.meta.dirname, 'fixtures', dir, 'tariffs.json'), 'utf8'),
        ) as unknown,
      );

    const valid = load('valid-state');
    const expired = load('expired-state');
    expect(valid.ok && expired.ok).toBe(true);
    if (!valid.ok || !expired.ok) return;

    expect(resolveTariffState(valid.value, new Date()).status).toBe('valid');
    expect(resolveTariffState(expired.value, new Date()).status).toBe('review_required');
  });
});

describe('в исходниках нет захардкоженных цен', () => {
  const sourceFiles = walk(SRC_DIR, ['.ts', '.astro', '.js', '.mjs']);

  it('ни одного числа рядом с BYN', () => {
    // Ловит «158,42 BYN» и «202.18 BYN» в любом файле сайта. Цены живут
    // только в data/, попадают на страницу только через схему.
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const text = readFileSync(file, 'utf8');
      const match = /\d{1,5}[.,]\d{2}\s*(?:BYN|byn|бел\.?\s*руб)/.exec(text);
      if (match) offenders.push(`${relative(ROOT, file)}: «${match[0]}»`);
    }
    expect(offenders, `цена в исходнике:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('ни одной таблицы цен вне схемы и данных', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      if (file.endsWith('schema.ts')) continue; // здесь имя поля — часть типа
      const text = readFileSync(file, 'utf8');
      if (/prices_byn_per_gram\s*[:=]\s*\{[^}]*\d/.test(text)) offenders.push(relative(ROOT, file));
    }
    expect(offenders, `таблица цен в исходнике: ${offenders.join(', ')}`).toEqual([]);
  });
});
