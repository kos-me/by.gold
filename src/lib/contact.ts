/**
 * Rules for accepting a report of an error in a figure.
 *
 * One module for both the browser and the worker: the client-side check is a
 * courtesy, the server-side one is real, and the two must not drift apart.
 * The refusal wordings live here too, so a person sees the same thing whether
 * or not the request reached the server.
 *
 * Refusal messages are visitor-facing and therefore Russian.
 */

/** Enough to catch "a@b" and typos without arguing with RFC 5322. */
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

/** Shorter than this is not a description of a discrepancy. Nothing to reply to. */
export const MIN_NOTE_LENGTH = 12;

/** Upper bound, so the form cannot be used as a pipe. */
export const MAX_NOTE_LENGTH = 4000;
export const MAX_EMAIL_LENGTH = 254;

export interface ReportInput {
  readonly email: string;
  readonly note: string;
  /** Honeypot field. Empty for a human. */
  readonly city?: string;
  /** Turnstile token. Verified separately. */
  readonly turnstile?: string;
}

export type ReportRejection =
  | { readonly kind: 'email'; readonly message: string }
  | { readonly kind: 'note'; readonly message: string }
  /** The honeypot fired. The person need not be told. */
  | { readonly kind: 'honeypot'; readonly message: string };

export type ReportValidation =
  | { readonly ok: true; readonly email: string; readonly note: string }
  | { readonly ok: false; readonly rejection: ReportRejection };

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Validates a report. The same rules on the client and on the server.
 *
 * The honeypot is checked first: if it is filled, parsing the rest is moot.
 */
export function validateReport(input: Partial<ReportInput> | Record<string, unknown>): ReportValidation {
  const city = asString((input as Record<string, unknown>)['city']);
  if (city !== '') {
    return {
      ok: false,
      rejection: { kind: 'honeypot', message: 'Сообщение не принято.' },
    };
  }

  const email = asString((input as Record<string, unknown>)['email']);
  if (!EMAIL_RE.test(email) || email.length > MAX_EMAIL_LENGTH) {
    return {
      ok: false,
      rejection: {
        kind: 'email',
        message: 'Адрес почты выглядит неполным — без него мы не сможем ответить.',
      },
    };
  }

  const note = asString((input as Record<string, unknown>)['note']);
  if (note.length < MIN_NOTE_LENGTH) {
    return {
      ok: false,
      rejection: {
        kind: 'note',
        message: 'Опишите расхождение хотя бы одной фразой: что и где не сходится.',
      },
    };
  }
  if (note.length > MAX_NOTE_LENGTH) {
    return {
      ok: false,
      rejection: {
        kind: 'note',
        message: `Слишком длинно. Уложитесь в ${MAX_NOTE_LENGTH} символов.`,
      },
    };
  }

  return { ok: true, email, note };
}

/**
 * Extracts a decree number from the text of a report.
 *
 * Needed to tell which act is meant, so a fifth report about a discrepancy
 * already under review does not open a fifth thread. Recognised forms:
 * «№ N», «No N», «постановление N», «пост. N-M». Nothing found means `null`,
 * and the report is treated as ordinary rather than duplicate — guessing the
 * number is not allowed.
 */
export function extractActNumber(note: string): string | null {
  // `\b` is no use here: in JavaScript a word boundary is defined via the
  // ASCII class `\w`, so one never occurs before a Cyrillic letter. Hence a
  // "no letter to the left" lookbehind with the `u` flag instead.
  const NUMBER = '([0-9]{1,4}(?:-[0-9]{1,3})?)';
  const patterns = [
    new RegExp(`№\\s*${NUMBER}`, 'iu'),
    new RegExp(`(?<!\\p{L})no\\.?\\s*${NUMBER}`, 'iu'),
    new RegExp(`(?<!\\p{L})постановлени[еяию][^0-9]{0,20}?${NUMBER}`, 'iu'),
    new RegExp(`(?<!\\p{L})пост\\.?\\s*${NUMBER}`, 'iu'),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(note);
    if (match?.[1] !== undefined) return match[1];
  }
  return null;
}

/** `GB-482913`. Short enough for a person to quote in an email. */
export function formatTicket(random: number): string {
  const digits = Math.abs(Math.trunc(random)) % 1_000_000;
  return `GB-${String(digits).padStart(6, '0')}`;
}
