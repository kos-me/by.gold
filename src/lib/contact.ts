/**
 * Правила приёма сообщения об ошибке в цифре.
 *
 * Один модуль на браузер и на воркер: проверка на клиенте — вежливость,
 * проверка на сервере — настоящая, и расходиться они не должны. Формулировки
 * отказов тоже здесь, чтобы человек видел одно и то же независимо от того,
 * дошёл ли запрос до сервера.
 */

/** Достаточно, чтобы отсеять «а@б» и опечатки, и не спорить с RFC 5322. */
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

/** Короче — это не описание расхождения, а «ошибка». Отвечать не на что. */
export const MIN_NOTE_LENGTH = 12;

/** Верхняя граница, чтобы форму нельзя было использовать как трубу. */
export const MAX_NOTE_LENGTH = 4000;
export const MAX_EMAIL_LENGTH = 254;

export interface ReportInput {
  readonly email: string;
  readonly note: string;
  /** Поле-ловушка. У человека пустое. */
  readonly city?: string;
  /** Токен Turnstile. Проверяется отдельно. */
  readonly turnstile?: string;
}

export type ReportRejection =
  | { readonly kind: 'email'; readonly message: string }
  | { readonly kind: 'note'; readonly message: string }
  /** Ловушка сработала. Человеку об этом знать не нужно. */
  | { readonly kind: 'honeypot'; readonly message: string };

export type ReportValidation =
  | { readonly ok: true; readonly email: string; readonly note: string }
  | { readonly ok: false; readonly rejection: ReportRejection };

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Проверяет сообщение. Одни и те же правила на клиенте и на сервере.
 *
 * Ловушка проверяется первой: если она заполнена, разбирать остальное
 * бессмысленно.
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
 * Достаёт номер постановления из текста сообщения.
 *
 * Нужно, чтобы понять, о каком акте речь, и не заводить пятое обращение
 * по уже проверяемому расхождению. Ищутся формы «№ 41», «No 41»,
 * «постановление 41», «пост. 41-1». Ничего не нашлось — `null`, и тогда
 * сообщение считается обычным, а не дубликатом: угадывать номер нельзя.
 */
export function extractActNumber(note: string): string | null {
  // `\b` здесь не годится: в JavaScript граница слова определена через
  // ASCII-класс `\w`, и перед кириллической буквой её попросту не бывает.
  // Поэтому вместо неё — «слева не буква» через lookbehind с флагом `u`.
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

/** `GB-482913`. Короткий, чтобы человек мог назвать его в письме. */
export function formatTicket(random: number): string {
  const digits = Math.abs(Math.trunc(random)) % 1_000_000;
  return `GB-${String(digits).padStart(6, '0')}`;
}
