/**
 * Разбор страницы Минфина с ценами скупки.
 *
 * Что парсер извлекает: номер акта, дату акта и таблицу цен по пробам.
 *
 * Чего он извлечь НЕ МОЖЕТ, и это важно: **на странице нет ни даты вступления
 * в силу, ни срока действия**. Там только «ПРИЛОЖЕНИЕ к постановлению …
 * ДД.ММ.ГГГГ № N» и таблица. Обе даты живут в тексте самого акта, а не в его
 * приложении. Поэтому парсер оставляет `effective_from` и `stated_expiry`
 * пустыми, а PR, который он открывает, заведомо не проходит проверку схемы,
 * пока человек не впишет их из акта. Красный CI здесь — это и есть шлагбаум.
 *
 * Структура таблицы снята с живой страницы, а не из макета. Особенности:
 *
 * - пробы стоят в отдельной строке-заголовке, цены — в строке «Золото
 *   в изделиях и ломе» под ними;
 * - одна ячейка заголовка может содержать **две пробы** (583 и 585 делят
 *   и ячейку, и цену);
 * - в строке золота первые две ячейки — номер по порядку и название,
 *   поэтому цены берутся с конца.
 *
 * Парсер ничего не публикует и ничего не решает. Он только читает.
 */

import { FINENESSES, type FinenessKey } from '../../src/lib/schema.ts';

export interface ParsedAct {
  readonly act_number: string;
  /** ISO `YYYY-MM-DD`. */
  readonly act_date: string;
  readonly prices_byn_per_gram: Readonly<Partial<Record<FinenessKey, number>>>;
}

export type ParseFailureReason =
  /** Пусто или не HTML. */
  | 'empty_document'
  /** Не нашли строку «к постановлению … № N». */
  | 'no_act_line'
  /** Нашли несколько разных актов — почти наверняка это архив. */
  | 'multiple_acts'
  /** Нет таблицы с пробами. */
  | 'no_price_table'
  /** Таблица есть, строки золота нет. */
  | 'no_gold_row'
  /** Число столбцов заголовка и цен не совпало. */
  | 'column_mismatch'
  /** Цена не разбирается как число. */
  | 'unparsable_price';

export type ParseWarningKind =
  /** Ожидаемой пробы в таблице не оказалось. */
  | 'missing_fineness'
  /** В таблице проба, которой мы не знаем. */
  | 'unexpected_fineness'
  /** Цена изменилась сильнее порога. */
  | 'large_move';

export interface ParseWarning {
  readonly kind: ParseWarningKind;
  readonly message: string;
}

export type ParseResult =
  | { readonly ok: true; readonly act: ParsedAct; readonly warnings: readonly ParseWarning[] }
  | { readonly ok: false; readonly reason: ParseFailureReason; readonly detail: string };

/** Движение цены сильнее этого требует человеческого взгляда, но не отказа. */
export const LARGE_MOVE_THRESHOLD = 0.15;

// ---------------------------------------------------------------------------

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&emsp;|&ensp;|&thinsp;/gi, ' ')
    .replace(/&laquo;|&raquo;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function withoutNoise(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

/** `08.07.2026` → `2026-07-08`. */
function toIsoDate(ddmmyyyy: string): string | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(ddmmyyyy);
  if (match === null) return null;
  const [, day, month, year] = match as unknown as [string, string, string, string];
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31) return null;
  return `${year}-${month}-${day}`;
}

/** `129,60` → `129.6`. Пробелы-разделители тысяч отбрасываются. */
function parsePrice(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

interface TableRow {
  readonly cells: readonly string[];
}

function parseTables(html: string): { raw: string; rows: TableRow[] }[] {
  const tables: { raw: string; rows: TableRow[] }[] = [];
  for (const match of html.matchAll(/<table[\s\S]*?<\/table>/gi)) {
    const raw = match[0];
    const rows: TableRow[] = [];
    for (const rowMatch of raw.matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
      const cells: string[] = [];
      for (const cellMatch of rowMatch[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
        // <br> внутри ячейки разделяет пробы: «583<br>585» — две пробы, одна цена.
        const inner = (cellMatch[1] ?? '').replace(/<br\s*\/?>/gi, '  ');
        cells.push(stripTags(inner).replace(/\s*\s*/g, ' '));
      }
      rows.push({ cells });
    }
    tables.push({ raw, rows });
  }
  return tables;
}

/**
 * Пробы из ячейки заголовка. Одна ячейка может содержать несколько:
 * «583 585» — это две пробы с общей ценой, а не число 583585.
 */
function finenessesInCell(cell: string): string[] {
  return [...cell.matchAll(/\b(\d{3})\b/g)].map((match) => match[1] as string);
}

// ---------------------------------------------------------------------------

/**
 * Разбирает страницу.
 *
 * @param html   сырой HTML как пришёл
 * @param source адрес, с которого он получен — только для сообщений об ошибке
 */
export function parseMinfinPage(html: string, source = ''): ParseResult {
  if (html.trim().length < 200) {
    return { ok: false, reason: 'empty_document', detail: `${source}: пустой ответ` };
  }

  const clean = withoutNoise(html);
  const text = stripTags(clean);

  // --- акт ------------------------------------------------------------------
  // «ПРИЛОЖЕНИЕ к постановлению Министерства финансов … 08.07.2026 № 31»
  //
  // Номер акта у Минфина числовой, но шаблон допускает и буквы: иначе
  // фикстуры пришлось бы нумеровать правдоподобными числами, а они обязаны
  // быть заведомо ненастоящими («TEST-1»). Токен всё равно жёстко зажат
  // между «№» и концом — случайному слову туда не попасть.
  const actPattern =
    /к\s+постановлению[^№]{0,200}?(\d{2}\.\d{2}\.\d{4})\s*№\s*([A-Za-zА-Яа-я0-9]{1,12}(?:[-/][A-Za-zА-Яа-я0-9]{1,6})?)/gi;
  const acts = [...text.matchAll(actPattern)].map((match) => ({
    date: match[1] as string,
    number: match[2] as string,
  }));

  if (acts.length === 0) {
    return {
      ok: false,
      reason: 'no_act_line',
      detail:
        `${source}: не найдена строка «к постановлению … № N». ` +
        'Так выглядит страница на техобслуживании и любая другая подмена вёрстки.',
    };
  }

  // Несколько разных актов на странице — это архив, а не текущая страница.
  // Выбрать «наверное, вот этот» тут нельзя: ошибка выбора даст неверную цену.
  const distinct = new Set(acts.map((act) => `${act.date}|${act.number}`));
  if (distinct.size > 1) {
    return {
      ok: false,
      reason: 'multiple_acts',
      detail:
        `${source}: на странице ${distinct.size} разных постановлений ` +
        `(${[...distinct].join('; ')}). Похоже на архив, а не на действующую страницу.`,
    };
  }

  const act = acts[0] as { date: string; number: string };
  const actDate = toIsoDate(act.date);
  if (actDate === null) {
    return { ok: false, reason: 'no_act_line', detail: `${source}: дата «${act.date}» не разбирается` };
  }

  // --- таблица --------------------------------------------------------------
  const tables = parseTables(clean);
  const priceTable = tables.find((table) =>
    table.rows.some((row) => row.cells.some((cell) => /^\s*пробы\s*$/i.test(cell))),
  );

  if (priceTable === undefined) {
    return {
      ok: false,
      reason: 'no_price_table',
      detail: `${source}: не найдена таблица с заголовком «ПРОБЫ»`,
    };
  }

  // `\w` здесь не годится: в JavaScript это ASCII-класс, и `золот\w*`
  // не совпадает даже с «золото». Только явный кириллический класс.
  const goldRowIndex = priceTable.rows.findIndex((row) =>
    row.cells.some((cell) => /золот[а-яё]*\s+в\s+издели/i.test(cell)),
  );
  if (goldRowIndex === -1) {
    return {
      ok: false,
      reason: 'no_gold_row',
      detail: `${source}: в таблице нет строки «Золото в изделиях и ломе»`,
    };
  }

  // Строка проб — ближайшая строка ВЫШЕ золота, состоящая только из чисел.
  let headerRow: TableRow | undefined;
  for (let index = goldRowIndex - 1; index >= 0; index -= 1) {
    const row = priceTable.rows[index];
    if (row === undefined) continue;
    const numeric = row.cells.filter((cell) => finenessesInCell(cell).length > 0);
    if (numeric.length >= 3 && numeric.length === row.cells.length) {
      headerRow = row;
      break;
    }
  }

  if (headerRow === undefined) {
    return {
      ok: false,
      reason: 'no_price_table',
      detail: `${source}: не найдена строка с перечнем проб над строкой золота`,
    };
  }

  const groups = headerRow.cells.map(finenessesInCell);
  const goldCells = priceTable.rows[goldRowIndex]?.cells ?? [];
  // Первые ячейки строки — номер по порядку и название; цены идут с конца.
  const priceCells = goldCells.slice(goldCells.length - groups.length);

  if (goldCells.length < groups.length || priceCells.length !== groups.length) {
    return {
      ok: false,
      reason: 'column_mismatch',
      detail:
        `${source}: проб в заголовке ${groups.length}, ` +
        `а ячеек в строке золота всего ${goldCells.length}`,
    };
  }

  // Если в блок цен попала ячейка с буквами, столбцы разъехались: мы взяли
  // название строки вместо цены. Разбирать такое нельзя — сдвиг на один
  // столбец даёт правдоподобные, но чужие цифры.
  const shifted = priceCells.find((cell) => /[а-яёa-z]/i.test(cell));
  if (shifted !== undefined) {
    return {
      ok: false,
      reason: 'column_mismatch',
      detail:
        `${source}: в блоке цен оказалась ячейка «${shifted}» — ` +
        'столбцы сдвинулись, вёрстка таблицы изменилась',
    };
  }

  const prices: Partial<Record<FinenessKey, number>> = {};
  const warnings: ParseWarning[] = [];

  for (const [index, group] of groups.entries()) {
    const cell = priceCells[index] ?? '';
    const price = parsePrice(cell);
    if (price === null) {
      return {
        ok: false,
        reason: 'unparsable_price',
        detail: `${source}: цена «${cell}» для проб ${group.join('/')} не разбирается как число`,
      };
    }
    for (const fineness of group) {
      if ((FINENESSES as readonly string[]).includes(fineness)) {
        prices[fineness as FinenessKey] = price;
      } else {
        // Новая проба в акте — повод посмотреть, но не повод отвергнуть данные.
        warnings.push({
          kind: 'unexpected_fineness',
          message: `в таблице проба ${fineness}, которой нет в списке сайта`,
        });
      }
    }
  }

  for (const fineness of FINENESSES) {
    if (prices[fineness] === undefined) {
      warnings.push({
        kind: 'missing_fineness',
        message: `пробы ${fineness} в таблице нет`,
      });
    }
  }

  return {
    ok: true,
    act: { act_number: act.number, act_date: actDate, prices_byn_per_gram: prices },
    warnings,
  };
}

/**
 * Сравнивает разобранные цены с предыдущими и отмечает крупные движения.
 *
 * Порог — 15%. Превышение помечается как «нужна проверка», **не** как
 * невалидность: цена золота действительно может подскочить, и отвергнуть
 * верные данные хуже, чем показать их человеку.
 */
export function checkPriceMoves(
  parsed: Readonly<Partial<Record<FinenessKey, number>>>,
  previous: Readonly<Partial<Record<FinenessKey, number>>> | null,
  threshold = LARGE_MOVE_THRESHOLD,
): readonly ParseWarning[] {
  if (previous === null) return [];
  const warnings: ParseWarning[] = [];

  for (const fineness of FINENESSES) {
    const before = previous[fineness];
    const after = parsed[fineness];
    if (before === undefined || after === undefined || before <= 0) continue;

    const move = (after - before) / before;
    if (Math.abs(move) > threshold) {
      const percent = (move * 100).toFixed(1).replace('.', ',');
      warnings.push({
        kind: 'large_move',
        message:
          `проба ${fineness}: изменение ${move > 0 ? '+' : ''}${percent}% ` +
          `(было ${before.toFixed(2)}, стало ${after.toFixed(2)}) — сверьте с актом`,
      });
    }
  }

  return warnings;
}

/** Изменился ли акт по сравнению с последней известной записью. */
export function isNewAct(
  parsed: ParsedAct,
  known: { readonly act_number: string; readonly act_date: string } | null,
): boolean {
  if (known === null) return true;
  return parsed.act_number !== known.act_number || parsed.act_date !== known.act_date;
}
