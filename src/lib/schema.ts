/**
 * Схема данных и её проверка.
 *
 * Единственное место, где решается, можно ли верить записи. Всё, что не
 * прошло проверку, до страницы не доходит — сборка падает. Лучше пустая
 * страница, чем цифра неизвестного происхождения.
 *
 * Модуль без зависимостей: его импортирует и сайт, и cron-воркер.
 */

import { isIsoDate, isIsoDateTime } from './date.ts';

/**
 * Пробы золота, по которым Минфин устанавливает цену скупки изделий и лома.
 *
 * Список снят со страницы источника, а не из макета. В макете было шесть проб
 * (375, 500, 585, 750, 958, 999) — на деле их девять, и набор другой:
 *
 * - есть **583** — советский стандарт, которого в макете не было вовсе.
 *   Для наследственных изделий это едва ли не самая частая проба, так что
 *   её отсутствие было бы дырой ровно там, где сайт нужнее всего.
 * - есть 900, 916, 950 — тоже не было.
 * - **999 в этой таблице нет.** Чистое золото идёт отдельной строкой
 *   («за грамм металла в чистоте») и по мерным слиткам, а не как проба
 *   изделия. Показывать 999 в таблице скупки лома значило бы обещать
 *   цену, которой в акте нет.
 *
 * 583 и 585 стоят в одной ячейке таблицы и делят цену — парсер это учитывает.
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

/** Проба, вокруг которой построена главная. Самая частая у населения. */
export const HEADLINE_FINENESS: FinenessKey = '585';

/**
 * Хосты, ссылку на которые можно считать источником.
 *
 * Список намеренно короткий и закрытый: добавление хоста — отдельное
 * осознанное действие, а не побочный эффект правки данных. Всё остальное
 * (новости, агрегаторы, чьи-то перепечатки) источником не является.
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

/** Хосты, допустимые для цен на слитки. НБРБ — единственный источник. */
export const ALLOWED_BULLION_HOSTS = ['nbrb.by', 'www.nbrb.by'] as const;

/** Цены за грамм лигатурной массы, BYN. Ключ — проба. */
export type PriceTable = Readonly<Partial<Record<FinenessKey, number>>>;

/** Запись о постановлении Минфина. */
export interface TariffRecord {
  /** Номер акта как в самом акте, без «№». Обязательно. */
  readonly act_number: string;
  /** Дата принятия акта, `YYYY-MM-DD`. */
  readonly act_date: string;
  /** Дата вступления в силу, `YYYY-MM-DD`. Обязательно. */
  readonly effective_from: string;
  /**
   * Дата, по которую акт действует, `YYYY-MM-DD`, либо `null`.
   * `null` — акт срока не называет. Выдумывать срок нельзя ни при каких
   * обстоятельствах: это ровно та ошибка, ради которой проект и существует.
   */
  readonly stated_expiry: string | null;
  /** Ссылка на акт или на страницу источника. Обязательно. */
  readonly source_url: string;
  /** Когда человек перенёс цифры, ISO с часовым поясом. */
  readonly transcribed_at: string;
  /** Кто перенёс. Чтобы было кого спросить. */
  readonly transcribed_by: string;
  /** Цены по пробам. Минимум одна. */
  readonly prices_byn_per_gram: PriceTable;
  /** Необязательный комментарий человека. */
  readonly notes?: string;
}

/** Цена обратного выкупа мерного слитка НБРБ. Другой регламент, другой файл. */
export interface BullionRecord {
  /** Масса слитка в граммах. */
  readonly mass_grams: number;
  /** Проба слитка, как её публикует НБРБ, например `999.9`. */
  readonly fineness: string;
  /** Цена обратного выкупа за слиток целиком, BYN. */
  readonly buyback_byn: number;
  /** На какую дату цена, `YYYY-MM-DD`. */
  readonly quoted_on: string;
  /** Ссылка на страницу НБРБ. */
  readonly source_url: string;
  /** Когда получено, ISO с часовым поясом. */
  readonly fetched_at: string;
}

/** Отметка о последней реальной проверке источника. Пишется воркером. */
export interface StatusRecord {
  /** ISO-момент последней проверки, либо `null` — проверок не было. */
  readonly last_checked: string | null;
  /** Что именно проверяли. */
  readonly last_checked_source: string | null;
}

export interface ValidationIssue {
  /** Где именно, например `[0].effective_from`. */
  readonly path: string;
  readonly message: string;
}

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

// ---------------------------------------------------------------------------
// Мелкие проверки
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Конечное положительное число. Ноль ценой не бывает — значит, ошибка переноса. */
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
// Постановления
// ---------------------------------------------------------------------------

/**
 * Проверяет одну запись о постановлении.
 *
 * Отвергает запись без `act_number`, `effective_from` или `source_url` —
 * это три поля, без которых цифра не имеет происхождения и показывать её
 * нельзя. `stated_expiry` обязано присутствовать, но `null` — законное
 * значение: часть актов срока не называет.
 */
export function validateTariffRecord(input: unknown, path = ''): ValidationResult<TariffRecord> {
  const issues: ValidationIssue[] = [];
  const at = (field: string): string => (path ? `${path}.${field}` : field);

  if (!isPlainObject(input)) {
    return { ok: false, issues: [{ path: path || '(корень)', message: 'ожидался объект' }] };
  }

  // --- три обязательных поля происхождения -------------------------------
  if (!isNonEmptyString(input['act_number'])) {
    issues.push({ path: at('act_number'), message: 'обязательное поле: номер постановления' });
  }
  if (!isIsoDate(input['effective_from'])) {
    issues.push({
      path: at('effective_from'),
      message: 'обязательное поле: дата вступления в силу, формат YYYY-MM-DD',
    });
  }
  if (!isNonEmptyString(input['source_url'])) {
    issues.push({ path: at('source_url'), message: 'обязательное поле: ссылка на источник' });
  } else {
    const host = hostOf(input['source_url']);
    if (host === null) {
      issues.push({ path: at('source_url'), message: 'не разбирается как http(s)-ссылка' });
    } else if (!(ALLOWED_SOURCE_HOSTS as readonly string[]).includes(host)) {
      issues.push({
        path: at('source_url'),
        message:
          `хост «${host}» не в списке официальных источников. ` +
          `Допустимы: ${ALLOWED_SOURCE_HOSTS.join(', ')}. ` +
          'Новости и перепечатки источником не являются.',
      });
    }
  }

  // --- дата акта ---------------------------------------------------------
  if (!isIsoDate(input['act_date'])) {
    issues.push({ path: at('act_date'), message: 'дата принятия акта, формат YYYY-MM-DD' });
  }

  // --- срок действия -----------------------------------------------------
  if (!('stated_expiry' in input)) {
    issues.push({
      path: at('stated_expiry'),
      message: 'поле обязано присутствовать; если акт срока не называет — null',
    });
  } else {
    const expiry = input['stated_expiry'];
    if (expiry !== null && !isIsoDate(expiry)) {
      issues.push({
        path: at('stated_expiry'),
        message: 'либо дата YYYY-MM-DD, либо null. Промежуточных вариантов нет',
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
        message: 'срок действия заканчивается раньше вступления в силу',
      });
    }
  }

  if (
    isIsoDate(input['act_date']) &&
    isIsoDate(input['effective_from']) &&
    input['effective_from'] < input['act_date']
  ) {
    issues.push({
      path: at('effective_from'),
      message: 'вступление в силу раньше даты принятия акта',
    });
  }

  // --- кто и когда переносил --------------------------------------------
  if (!isIsoDateTime(input['transcribed_at'])) {
    issues.push({
      path: at('transcribed_at'),
      message: 'момент переноса, ISO с часовым поясом (например 2026-07-18T09:00:00Z)',
    });
  }
  if (!isNonEmptyString(input['transcribed_by'])) {
    issues.push({ path: at('transcribed_by'), message: 'кто перенёс цифры' });
  }

  // --- цены --------------------------------------------------------------
  const prices = input['prices_byn_per_gram'];
  if (!isPlainObject(prices)) {
    issues.push({ path: at('prices_byn_per_gram'), message: 'ожидался объект «проба → цена»' });
  } else {
    const keys = Object.keys(prices);
    if (keys.length === 0) {
      issues.push({ path: at('prices_byn_per_gram'), message: 'нужна хотя бы одна проба' });
    }
    for (const key of keys) {
      const where = `${at('prices_byn_per_gram')}.${key}`;
      if (!(FINENESSES as readonly string[]).includes(key)) {
        issues.push({
          path: where,
          message: `неизвестная проба. Известны: ${FINENESSES.join(', ')}`,
        });
        continue;
      }
      if (!isPositiveFinite(prices[key])) {
        issues.push({ path: where, message: 'цена должна быть положительным числом' });
      }
    }
  }

  if (input['notes'] !== undefined && typeof input['notes'] !== 'string') {
    issues.push({ path: at('notes'), message: 'комментарий должен быть строкой' });
  }

  if (issues.length > 0) return { ok: false, issues };

  const raw = input as unknown as TariffRecord;
  const record: TariffRecord = {
    act_number: raw.act_number.trim(),
    act_date: raw.act_date,
    effective_from: raw.effective_from,
    stated_expiry: raw.stated_expiry,
    source_url: raw.source_url.trim(),
    transcribed_at: raw.transcribed_at,
    transcribed_by: raw.transcribed_by.trim(),
    prices_byn_per_gram: { ...raw.prices_byn_per_gram },
    ...(raw.notes === undefined ? {} : { notes: raw.notes }),
  };
  return { ok: true, value: record };
}

/**
 * Проверяет весь файл. Пустой массив — законное состояние: сайт умеет
 * показывать страницу без цифры, и это не ошибка сборки.
 */
export function validateTariffFile(input: unknown): ValidationResult<readonly TariffRecord[]> {
  if (!Array.isArray(input)) {
    return { ok: false, issues: [{ path: '(корень)', message: 'ожидался массив записей' }] };
  }

  const issues: ValidationIssue[] = [];
  const records: TariffRecord[] = [];

  input.forEach((item, index) => {
    const result = validateTariffRecord(item, `[${index}]`);
    if (result.ok) records.push(result.value);
    else issues.push(...result.issues);
  });

  // Один и тот же акт дважды — почти наверняка недосмотр при слиянии PR.
  const seen = new Map<string, number>();
  records.forEach((record, index) => {
    const key = `${record.act_number}|${record.effective_from}`;
    const first = seen.get(key);
    if (first === undefined) seen.set(key, index);
    else {
      issues.push({
        path: `[${index}].act_number`,
        message: `постановление № ${record.act_number} от ${record.effective_from} уже есть в записи [${first}]`,
      });
    }
  });

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: records };
}

// ---------------------------------------------------------------------------
// Слитки
// ---------------------------------------------------------------------------

export function validateBullionRecord(input: unknown, path = ''): ValidationResult<BullionRecord> {
  const issues: ValidationIssue[] = [];
  const at = (field: string): string => (path ? `${path}.${field}` : field);

  if (!isPlainObject(input)) {
    return { ok: false, issues: [{ path: path || '(корень)', message: 'ожидался объект' }] };
  }

  if (!isPositiveFinite(input['mass_grams'])) {
    issues.push({ path: at('mass_grams'), message: 'масса слитка в граммах, положительное число' });
  }
  if (!isNonEmptyString(input['fineness'])) {
    issues.push({ path: at('fineness'), message: 'проба слитка, как публикует НБРБ' });
  }
  if (!isPositiveFinite(input['buyback_byn'])) {
    issues.push({ path: at('buyback_byn'), message: 'цена выкупа за слиток, положительное число' });
  }
  if (!isIsoDate(input['quoted_on'])) {
    issues.push({ path: at('quoted_on'), message: 'дата котировки, формат YYYY-MM-DD' });
  }
  if (!isIsoDateTime(input['fetched_at'])) {
    issues.push({ path: at('fetched_at'), message: 'момент получения, ISO с часовым поясом' });
  }
  if (!isNonEmptyString(input['source_url'])) {
    issues.push({ path: at('source_url'), message: 'ссылка на страницу НБРБ' });
  } else {
    const host = hostOf(input['source_url']);
    if (host === null || !(ALLOWED_BULLION_HOSTS as readonly string[]).includes(host)) {
      issues.push({
        path: at('source_url'),
        message: `цены на слитки берутся только с ${ALLOWED_BULLION_HOSTS.join(' / ')}`,
      });
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: input as unknown as BullionRecord };
}

export function validateBullionFile(input: unknown): ValidationResult<readonly BullionRecord[]> {
  if (!Array.isArray(input)) {
    return { ok: false, issues: [{ path: '(корень)', message: 'ожидался массив записей' }] };
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
    return { ok: false, issues: [{ path: '(корень)', message: 'ожидался объект' }] };
  }
  const issues: ValidationIssue[] = [];
  const checked = input['last_checked'];
  if (checked !== null && !isIsoDateTime(checked)) {
    issues.push({
      path: 'last_checked',
      message: 'либо ISO-момент с часовым поясом, либо null — если проверок ещё не было',
    });
  }
  const source = input['last_checked_source'];
  if (source !== null && typeof source !== 'string') {
    issues.push({ path: 'last_checked_source', message: 'строка или null' });
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

/** Человекочитаемый список замечаний — для падающей сборки и для PR-бота. */
export function formatIssues(issues: readonly ValidationIssue[]): string {
  return issues.map((issue) => `  ${issue.path}: ${issue.message}`).join('\n');
}
