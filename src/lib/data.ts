/**
 * Чтение данных на сборке.
 *
 * Данные читаются один раз, проверяются схемой и, если не прошли, сборка
 * падает с перечнем замечаний. Молча подставить «что получилось» нельзя:
 * страница либо стоит на проверенной записи, либо честно говорит, что цифры нет.
 *
 * Каталог данных переопределяется переменной `GOLD_DATA_DIR` — этим на шаге 6
 * пользуется превью с тестовой фикстурой. В самом `data/` фикстур не бывает.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  formatIssues,
  validateBullionFile,
  validateStatusFile,
  validateTariffFile,
  type BullionRecord,
  type StatusRecord,
  type TariffRecord,
} from './schema.ts';

export const DATA_DIR = resolve(process.cwd(), process.env['GOLD_DATA_DIR'] ?? 'data');

/** `true`, когда сборка идёт не на настоящих данных. Показывается в консоли. */
export const USING_OVERRIDDEN_DATA = process.env['GOLD_DATA_DIR'] !== undefined;

function readJson(fileName: string, fallback: unknown): unknown {
  const path = resolve(DATA_DIR, fileName);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    // Отсутствующий файл — это «данных нет», законное состояние сайта.
    return fallback;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    throw new Error(
      `${path}: файл не разбирается как JSON. Сборка остановлена, чтобы не показать ` +
        `страницу на непроверенных данных.\n${String(error)}`,
    );
  }
}

function loadTariffs(): readonly TariffRecord[] {
  const result = validateTariffFile(readJson('tariffs.json', []));
  if (!result.ok) {
    throw new Error(
      `data/tariffs.json не прошёл проверку схемы — сборка остановлена.\n` +
        `${formatIssues(result.issues)}\n\n` +
        `Запись без номера акта, даты вступления в силу или ссылки на источник ` +
        `на сайт не попадает. Исправьте запись или удалите её: пустой файл — ` +
        `рабочее состояние, страница умеет обходиться без цифры.`,
    );
  }
  return result.value;
}

function loadBullion(): readonly BullionRecord[] {
  const result = validateBullionFile(readJson('bullion.json', []));
  if (!result.ok) {
    throw new Error(
      `data/bullion.json не прошёл проверку схемы — сборка остановлена.\n${formatIssues(result.issues)}`,
    );
  }
  return result.value;
}

function loadStatus(): StatusRecord {
  const result = validateStatusFile(
    readJson('status.json', { last_checked: null, last_checked_source: null }),
  );
  if (!result.ok) {
    throw new Error(
      `data/status.json не прошёл проверку схемы — сборка остановлена.\n${formatIssues(result.issues)}`,
    );
  }
  return result.value;
}

export const tariffs: readonly TariffRecord[] = loadTariffs();
export const bullion: readonly BullionRecord[] = loadBullion();
export const status: StatusRecord = loadStatus();
