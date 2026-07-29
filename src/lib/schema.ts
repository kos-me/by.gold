/**
 * The data schema and its validation.
 *
 * The single place where it is decided whether a record can be trusted.
 * Anything that fails validation never reaches a page — the build fails
 * instead. An empty page beats a figure of unknown provenance.
 *
 * Dependency-free: imported by both the site and the cron worker.
 *
 * Validation messages are developer-facing (they surface on a failed build
 * and in the worker's pull requests), so they are English. Visitor-facing
 * strings elsewhere in the codebase stay Russian.
 */

import { isIsoDate, isIsoDateTime } from './date.ts';

/**
 * Gold finenesses for which Minfin sets a buyback price for items and scrap.
 *
 * Taken from the source page, not from the mockup. The mockup listed six
 * (375, 500, 585, 750, 958, 999); the act lists nine, and the set differs:
 *
 * - **583** is present and was absent from the mockup entirely. It is the
 *   Soviet standard and, for inherited jewellery, very likely the single most
 *   common fineness — leaving it out would have been a hole exactly where the
 *   site matters most.
 * - 900, 916 and 950 were missing too.
 * - **999 is not in this table.** Pure gold appears as its own line ("per gram
 *   of metal in fineness") and under bullion bars, not as the fineness of an
 *   item. Showing 999 among scrap finenesses would promise a price the act
 *   does not state.
 *
 * 583 and 585 share one table cell and one price — the parser handles that.
 */
export const FINENESSES = [
  '375',
  '500',
  '583',
  '585',
  '750',
  '900',
  '916',
  '950',
  '958',
] as const;
export type FinenessKey = (typeof FINENESSES)[number];

/** The fineness the homepage is built around. The most common one in circulation. */
export const HEADLINE_FINENESS: FinenessKey = '585';

/**
 * Hosts a link may point at to count as a source.
 *
 * Deliberately short and closed: adding a host is a separate, deliberate act
 * rather than a side effect of editing data. Everything else — news,
 * aggregators, someone's reprint — is not a source.
 */
export const ALLOWED_SOURCE_HOSTS = [
  'minfin.gov.by',
  'www.minfin.gov.by',
  'pravo.by',
  'www.pravo.by',
  'etalonline.by',
  'www.etalonline.by',
  'nbrb.by',
  'www.nbrb.by',
] as const;

/** Hosts permitted for bullion prices. The National Bank is the only source. */
export const ALLOWED_BULLION_HOSTS = ['nbrb.by', 'www.nbrb.by'] as const;

/** Prices per gram of alloy mass, BYN. Keyed by fineness. */
export type PriceTable = Readonly<Partial<Record<FinenessKey, number>>>;

/** A record of one Minfin decree. */
export interface TariffRecord {
  /** The act's number as printed in the act, without «№». Required. */
  readonly act_number: string;
  /** The date the act was adopted, `YYYY-MM-DD`. */
  readonly act_date: string;
  /** The date the act takes force, `YYYY-MM-DD`. Required. */
  readonly effective_from: string;
  /**
   * The date through which the act is in force, `YYYY-MM-DD`, or `null`.
   * `null` means the act names no end date. Inventing one is forbidden under
   * any circumstance: that is precisely the failure this project exists to
   * prevent.
   */
  readonly stated_expiry: string | null;
  /**
   * Where the figures were read from. Defaults to `'act'`.
   *
   * `'archive'` marks a record taken from a Ministry year-archive page rather
   * than from the act. Those pages publish the act's number, its date, the
   * date it took force and its price tables — but **not** the act's text, so
   * whether it named an end date is simply unknown. Such a record must carry
   * `stated_expiry: null`, and there `null` means "not read", not "the act
   * names none".
   *
   * That ambiguity is prevented from ever mattering: an `'archive'` record
   * feeds history and nothing else. It can never become the current act, so
   * no figure the site shows as in force can rest on an unread expiry.
   */
  readonly transcribed_from?: 'act' | 'archive';
  /** Link to the act or to the source page. Required. */
  readonly source_url: string;
  /** When a person transcribed the figures, ISO with a time zone. */
  readonly transcribed_at: string;
  /** Who transcribed them, so there is someone to ask. */
  readonly transcribed_by: string;
  /** Prices by fineness. At least one. */
  readonly prices_byn_per_gram: PriceTable;
  /** Optional human note. */
  readonly notes?: string;
}

/** A National Bank buyback price for a bullion bar. Different regime, different file. */
export interface BullionRecord {
  /** Bar mass in grams. */
  readonly mass_grams: number;
  /** Bar fineness as the National Bank publishes it, e.g. `999.9`. */
  readonly fineness: string;
  /** Buyback price for the whole bar, BYN. */
  readonly buyback_byn: number;
  /** The date the price applies to, `YYYY-MM-DD`. */
  readonly quoted_on: string;
  /** Link to the National Bank page. */
  readonly source_url: string;
  /** When it was fetched, ISO with a time zone. */
  readonly fetched_at: string;
}

/** A record of the last real check of the source. Written by the worker. */
export interface StatusRecord {
  /** ISO instant of the last check, or `null` when there has been none. */
  readonly last_checked: string | null;
  /** What exactly was checked. */
  readonly last_checked_source: string | null;
}

export interface ValidationIssue {
  /** Where exactly, e.g. `[0].effective_from`. */
  readonly path: string;
  readonly message: string;
}

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

// ---------------------------------------------------------------------------
// Small predicates
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** A finite positive number. A price is never zero — that means a transcription slip. */
function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function hostOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Decrees
// ---------------------------------------------------------------------------

/**
 * Validates one decree record.
 *
 * Rejects any record missing `act_number`, `effective_from` or `source_url` —
 * the three fields without which a figure has no provenance and must not be
 * shown. `stated_expiry` must be present, but `null` is a legal value: some
 * acts name no end date.
 */
export function validateTariffRecord(input: unknown, path = ''): ValidationResult<TariffRecord> {
  const issues: ValidationIssue[] = [];
  const at = (field: string): string => (path ? `${path}.${field}` : field);

  if (!isPlainObject(input)) {
    return { ok: false, issues: [{ path: path || '(root)', message: 'expected an object' }] };
  }

  // --- the three mandatory provenance fields ------------------------------
  if (!isNonEmptyString(input['act_number'])) {
    issues.push({ path: at('act_number'), message: 'required: the decree number' });
  }
  if (!isIsoDate(input['effective_from'])) {
    issues.push({
      path: at('effective_from'),
      message: 'required: the date the act takes force, format YYYY-MM-DD',
    });
  }
  if (!isNonEmptyString(input['source_url'])) {
    issues.push({ path: at('source_url'), message: 'required: link to the source' });
  } else {
    const host = hostOf(input['source_url']);
    if (host === null) {
      issues.push({ path: at('source_url'), message: 'does not parse as an http(s) link' });
    } else if (!(ALLOWED_SOURCE_HOSTS as readonly string[]).includes(host)) {
      issues.push({
        path: at('source_url'),
        message:
          `host "${host}" is not in the list of official sources. ` +
          `Allowed: ${ALLOWED_SOURCE_HOSTS.join(', ')}. ` +
          'News coverage and reprints are not sources.',
      });
    }
  }

  // --- act date ------------------------------------------------------------
  if (!isIsoDate(input['act_date'])) {
    issues.push({ path: at('act_date'), message: 'date the act was adopted, format YYYY-MM-DD' });
  }

  // --- period of force -----------------------------------------------------
  if (!('stated_expiry' in input)) {
    issues.push({
      path: at('stated_expiry'),
      message: 'field must be present; use null when the act names no end date',
    });
  } else {
    const expiry = input['stated_expiry'];
    if (expiry !== null && !isIsoDate(expiry)) {
      issues.push({
        path: at('stated_expiry'),
        message: 'either a YYYY-MM-DD date or null. There is nothing in between',
      });
    }
    if (
      typeof expiry === 'string' &&
      isIsoDate(expiry) &&
      isIsoDate(input['effective_from']) &&
      expiry < input['effective_from']
    ) {
      issues.push({
        path: at('stated_expiry'),
        message: 'the act expires before it takes force',
      });
    }
  }

  // --- where it was read from ----------------------------------------------
  const from = input['transcribed_from'];
  if (from !== undefined && from !== 'act' && from !== 'archive') {
    issues.push({
      path: at('transcribed_from'),
      message: "either 'act' or 'archive'. Omit it when the act itself was read",
    });
  }
  if (from === 'archive' && input['stated_expiry'] !== null) {
    // The year-archive pages carry no act text, so an expiry read from one
    // cannot exist. A date here would mean it came from somewhere unrecorded.
    issues.push({
      path: at('stated_expiry'),
      message:
        'must be null on an archive record: the archive pages do not publish the act text, ' +
        'so its end date cannot have been read',
    });
  }

  if (
    isIsoDate(input['act_date']) &&
    isIsoDate(input['effective_from']) &&
    input['effective_from'] < input['act_date']
  ) {
    issues.push({
      path: at('effective_from'),
      message: 'takes force before the act was adopted',
    });
  }

  // --- who transcribed it, and when ---------------------------------------
  if (!isIsoDateTime(input['transcribed_at'])) {
    issues.push({
      path: at('transcribed_at'),
      message: 'transcription instant, ISO with a time zone (e.g. 2026-07-18T09:00:00Z)',
    });
  }
  if (!isNonEmptyString(input['transcribed_by'])) {
    issues.push({ path: at('transcribed_by'), message: 'who transcribed the figures' });
  }

  // --- prices --------------------------------------------------------------
  const prices = input['prices_byn_per_gram'];
  if (!isPlainObject(prices)) {
    issues.push({ path: at('prices_byn_per_gram'), message: 'expected a "fineness → price" object' });
  } else {
    const keys = Object.keys(prices);
    if (keys.length === 0) {
      issues.push({ path: at('prices_byn_per_gram'), message: 'at least one fineness is needed' });
    }
    for (const key of keys) {
      const where = `${at('prices_byn_per_gram')}.${key}`;
      if (!(FINENESSES as readonly string[]).includes(key)) {
        issues.push({
          path: where,
          message: `unknown fineness. Known: ${FINENESSES.join(', ')}`,
        });
        continue;
      }
      if (!isPositiveFinite(prices[key])) {
        issues.push({ path: where, message: 'price must be a positive number' });
      }
    }
  }

  if (input['notes'] !== undefined && typeof input['notes'] !== 'string') {
    issues.push({ path: at('notes'), message: 'the note must be a string' });
  }

  if (issues.length > 0) return { ok: false, issues };

  const raw = input as unknown as TariffRecord;
  const record: TariffRecord = {
    act_number: raw.act_number.trim(),
    act_date: raw.act_date,
    effective_from: raw.effective_from,
    stated_expiry: raw.stated_expiry,
    ...(raw.transcribed_from === undefined ? {} : { transcribed_from: raw.transcribed_from }),
    source_url: raw.source_url.trim(),
    transcribed_at: raw.transcribed_at,
    transcribed_by: raw.transcribed_by.trim(),
    prices_byn_per_gram: { ...raw.prices_byn_per_gram },
    ...(raw.notes === undefined ? {} : { notes: raw.notes }),
  };
  return { ok: true, value: record };
}

/**
 * Validates the whole file. An empty array is a legal state: the site can
 * render without a figure, and that is not a build error.
 */
export function validateTariffFile(input: unknown): ValidationResult<readonly TariffRecord[]> {
  if (!Array.isArray(input)) {
    return { ok: false, issues: [{ path: '(root)', message: 'expected an array of records' }] };
  }

  const issues: ValidationIssue[] = [];
  const records: TariffRecord[] = [];

  input.forEach((item, index) => {
    const result = validateTariffRecord(item, `[${index}]`);
    if (result.ok) records.push(result.value);
    else issues.push(...result.issues);
  });

  // The same act twice is almost certainly an oversight while merging a PR.
  const seen = new Map<string, number>();
  records.forEach((record, index) => {
    const key = `${record.act_number}|${record.effective_from}`;
    const first = seen.get(key);
    if (first === undefined) seen.set(key, index);
    else {
      issues.push({
        path: `[${index}].act_number`,
        message: `decree № ${record.act_number} of ${record.effective_from} is already present as record [${first}]`,
      });
    }
  });

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: records };
}

// ---------------------------------------------------------------------------
// Bullion
// ---------------------------------------------------------------------------

export function validateBullionRecord(input: unknown, path = ''): ValidationResult<BullionRecord> {
  const issues: ValidationIssue[] = [];
  const at = (field: string): string => (path ? `${path}.${field}` : field);

  if (!isPlainObject(input)) {
    return { ok: false, issues: [{ path: path || '(root)', message: 'expected an object' }] };
  }

  if (!isPositiveFinite(input['mass_grams'])) {
    issues.push({ path: at('mass_grams'), message: 'bar mass in grams, a positive number' });
  }
  if (!isNonEmptyString(input['fineness'])) {
    issues.push({ path: at('fineness'), message: 'bar fineness as the National Bank publishes it' });
  }
  if (!isPositiveFinite(input['buyback_byn'])) {
    issues.push({ path: at('buyback_byn'), message: 'buyback price per bar, a positive number' });
  }
  if (!isIsoDate(input['quoted_on'])) {
    issues.push({ path: at('quoted_on'), message: 'quotation date, format YYYY-MM-DD' });
  }
  if (!isIsoDateTime(input['fetched_at'])) {
    issues.push({ path: at('fetched_at'), message: 'fetch instant, ISO with a time zone' });
  }
  if (!isNonEmptyString(input['source_url'])) {
    issues.push({ path: at('source_url'), message: 'link to the National Bank page' });
  } else {
    const host = hostOf(input['source_url']);
    if (host === null || !(ALLOWED_BULLION_HOSTS as readonly string[]).includes(host)) {
      issues.push({
        path: at('source_url'),
        message: `bullion prices come only from ${ALLOWED_BULLION_HOSTS.join(' / ')}`,
      });
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: input as unknown as BullionRecord };
}

export function validateBullionFile(input: unknown): ValidationResult<readonly BullionRecord[]> {
  if (!Array.isArray(input)) {
    return { ok: false, issues: [{ path: '(root)', message: 'expected an array of records' }] };
  }
  const issues: ValidationIssue[] = [];
  const records: BullionRecord[] = [];
  input.forEach((item, index) => {
    const result = validateBullionRecord(item, `[${index}]`);
    if (result.ok) records.push(result.value);
    else issues.push(...result.issues);
  });
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: records };
}

export function validateStatusFile(input: unknown): ValidationResult<StatusRecord> {
  if (!isPlainObject(input)) {
    return { ok: false, issues: [{ path: '(root)', message: 'expected an object' }] };
  }
  const issues: ValidationIssue[] = [];
  const checked = input['last_checked'];
  if (checked !== null && !isIsoDateTime(checked)) {
    issues.push({
      path: 'last_checked',
      message: 'either an ISO instant with a time zone, or null when no check has happened',
    });
  }
  const source = input['last_checked_source'];
  if (source !== null && typeof source !== 'string') {
    issues.push({ path: 'last_checked_source', message: 'a string or null' });
  }
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    value: {
      last_checked: (checked as string | null) ?? null,
      last_checked_source: (source as string | null) ?? null,
    },
  };
}

/** A human-readable list of issues — for a failing build and for the PR bot. */
export function formatIssues(issues: readonly ValidationIssue[]): string {
  return issues.map((issue) => `  ${issue.path}: ${issue.message}`).join('\n');
}
