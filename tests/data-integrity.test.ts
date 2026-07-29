/**
 * Guards on the boundary between real data and test data.
 *
 * This file is not about logic but about the single failure the project
 * exists to prevent: a plausible invented figure reaching production by
 * accident. It watches both sides of the boundary.
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

describe('data/ passes its own schema', () => {
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

describe('data/ must contain no test records', () => {
  const raw = readFileSync(resolve(DATA_DIR, 'tariffs.json'), 'utf8');

  it('not a single fixture marker in the file', () => {
    // Both spellings: the guard must hold whichever language a stub is written in.
    for (const marker of ['TEST-', 'FIXTURE', 'example.com', 'example.by', 'заглушка', 'placeholder', 'stub', 'dummy']) {
      expect(raw.toLowerCase()).not.toContain(marker.toLowerCase());
    }
  });

  it("nobody transcribed figures under the name \'test\'", () => {
    const result = validateTariffFile(readDataFile('tariffs.json'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const record of result.value) {
      expect(record.transcribed_by.toLowerCase()).not.toMatch(/^(тест|test)$/);
      expect(record.act_number.toUpperCase()).not.toMatch(/^TEST/);
    }
  });

  it('data/ holds only known files', () => {
    const allowed = new Set(['tariffs.json', 'bullion.json', 'status.json', 'README.md']);
    for (const entry of readdirSync(DATA_DIR)) {
      expect(allowed.has(entry), `unexpected file in data/: ${entry}`).toBe(true);
    }
  });
});

describe('fixtures stay unmistakably fake', () => {
  it('the act number is marked as a test', () => {
    expect(tariff().act_number).toMatch(/^TEST-/);
  });

  it('prices are orders below any real one — they cannot be confused', () => {
    // A real 585 gold price is hundreds of BYN per gram. Everything here must
    // be single digits: a plausible fixture is worse than a broken test.
    for (const price of Object.values(tariff().prices_byn_per_gram)) {
      expect(price).toBeLessThan(10);
    }
    expect(bullionRecord().buyback_byn).toBeLessThan(10);
  });

  it('fixture dates are from 2000, not the present', () => {
    expect(tariff().effective_from.startsWith('2000-')).toBe(true);
  });
});

describe('fixture directories are usable and unmistakably fake', () => {
  const DIRS = ['valid-state', 'expired-state'] as const;

  it.each(DIRS)('%s passes the schema', (dir) => {
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

  it.each(DIRS)('%s: act numbers carry TEST-, prices are single-digit BYN', (dir) => {
    const base = resolve(import.meta.dirname, 'fixtures', dir);
    const result = validateTariffFile(
      JSON.parse(readFileSync(resolve(base, 'tariffs.json'), 'utf8')) as unknown,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const record of result.value) {
      expect(record.act_number).toMatch(/^TEST-/);
      for (const price of Object.values(record.prices_byn_per_gram)) {
        expect(price, `${dir}: price ${price} looks too much like a real one`).toBeLessThan(10);
      }
    }
  });

  it('valid-state really resolves to valid, expired-state to review_required', () => {
    // Checked against "now": the valid-state expiry runs to 2099 precisely so
    // the fixture cannot rot silently.
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

describe('no hard-coded prices in the sources', () => {
  const sourceFiles = walk(SRC_DIR, ['.ts', '.astro', '.js', '.mjs']);

  it('not a single number next to BYN', () => {
    // Catches any number next to BYN in any site file. Prices live only in
    // data/ and reach a page only through the schema.
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const text = readFileSync(file, 'utf8');
      const match = /\d{1,5}[.,]\d{2}\s*(?:BYN|byn|бел\.?\s*руб)/.exec(text);
      if (match) offenders.push(`${relative(ROOT, file)}: «${match[0]}»`);
    }
    expect(offenders, `price in a source file:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('no price table outside the schema and the data', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      if (file.endsWith('schema.ts')) continue; // the field name is part of the type here
      const text = readFileSync(file, 'utf8');
      if (/prices_byn_per_gram\s*[:=]\s*\{[^}]*\d/.test(text)) offenders.push(relative(ROOT, file));
    }
    expect(offenders, `price table in a source file: ${offenders.join(', ')}`).toEqual([]);
  });
});
