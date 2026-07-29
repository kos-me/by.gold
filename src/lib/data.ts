/**
 * Reading the data at build time.
 *
 * Data is read once and validated; if it fails, the build dies with a list of
 * issues. Quietly substituting "whatever parsed" is not an option: the page
 * either stands on a verified record or says plainly that there is no figure.
 *
 * The data directory can be overridden with `GOLD_DATA_DIR` — that is how the
 * fixture previews work. `data/` itself never contains fixtures.
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

/** True when the build is not running on the real data. Surfaced on the page. */
export const USING_OVERRIDDEN_DATA = process.env['GOLD_DATA_DIR'] !== undefined;

function readJson(fileName: string, fallback: unknown): unknown {
  const path = resolve(DATA_DIR, fileName);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    // A missing file means "there is no data", which is a legal site state.
    return fallback;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    throw new Error(
      `${path}: file does not parse as JSON. Build stopped so the page is not ` +
        `rendered on unverified data.\n${String(error)}`,
    );
  }
}

function loadTariffs(): readonly TariffRecord[] {
  const result = validateTariffFile(readJson('tariffs.json', []));
  if (!result.ok) {
    throw new Error(
      `data/tariffs.json failed schema validation — build stopped.\n` +
        `${formatIssues(result.issues)}\n\n` +
        `A record without an act number, an effective date or a source link ` +
        `does not reach the site. Fix the record or remove it: an empty file ` +
        `is a working state, and the page knows how to manage without a figure.`,
    );
  }
  return result.value;
}

function loadBullion(): readonly BullionRecord[] {
  const result = validateBullionFile(readJson('bullion.json', []));
  if (!result.ok) {
    throw new Error(
      `data/bullion.json failed schema validation — build stopped.\n${formatIssues(result.issues)}`,
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
      `data/status.json failed schema validation — build stopped.\n${formatIssues(result.issues)}`,
    );
  }
  return result.value;
}

export const tariffs: readonly TariffRecord[] = loadTariffs();
export const bullion: readonly BullionRecord[] = loadBullion();
export const status: StatusRecord = loadStatus();
