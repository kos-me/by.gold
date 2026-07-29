/**
 * Предложение изменить данные: ветка, запись, доказательство, PR.
 *
 * Ключевое свойство: **предложенная запись заведомо не проходит проверку
 * схемы.** На странице Минфина нет ни даты вступления в силу, ни срока
 * действия — они в тексте самого акта. Воркер ставит на их месте `null`,
 * CI на PR краснеет, и слить его, не открыв акт и не вписав обе даты,
 * невозможно. Красный CI здесь не досадная мелочь, а сам шлагбаум.
 */

import type { TariffRecord } from '../../src/lib/schema.ts';
import type { ParsedAct, ParseWarning } from './minfin.ts';

/** Черновик записи: всё, что удалось прочитать, плюс дыры под даты. */
export interface DraftRecord extends Omit<TariffRecord, 'effective_from' | 'stated_expiry'> {
  /** `null` — человек вписывает из акта. Схема такое не примет, и это цель. */
  readonly effective_from: null;
  readonly stated_expiry: null;
}

export function buildDraft(act: ParsedAct, sourceUrl: string, fetchedAt: string): DraftRecord {
  return {
    act_number: act.act_number,
    act_date: act.act_date,
    effective_from: null,
    stated_expiry: null,
    source_url: sourceUrl,
    transcribed_at: fetchedAt,
    transcribed_by: 'ЗАПОЛНИТЕ: кто сверил с актом',
    prices_byn_per_gram: act.prices_byn_per_gram,
    notes: 'Черновик, собран автоматически. До слияния сверить с текстом акта.',
  };
}

/** Имя ветки. Одно и то же для одного акта — второй PR не откроется. */
export function branchNameFor(act: ParsedAct): string {
  const safe = act.act_number.replace(/[^A-Za-z0-9-]/g, '_');
  return `minfin/act-${safe}-${act.act_date}`;
}

/**
 * Добавляет черновик в массив записей и возвращает JSON для файла.
 * Порядок в файле не важен — код сортирует сам, — но новая запись
 * дописывается в конец, чтобы диф читался как «добавили одну».
 */
export function appendDraft(existingJson: string, draft: DraftRecord): string {
  let records: unknown[];
  try {
    const parsed = JSON.parse(existingJson) as unknown;
    records = Array.isArray(parsed) ? parsed : [];
  } catch {
    records = [];
  }
  return `${JSON.stringify([...records, draft], null, 2)}\n`;
}

export interface ProposalTexts {
  readonly title: string;
  readonly body: string;
  readonly commitMessage: string;
  readonly evidencePath: string;
}

export function proposalTexts(
  act: ParsedAct,
  warnings: readonly ParseWarning[],
  sourceUrl: string,
  checkedAt: string,
): ProposalTexts {
  const safe = act.act_number.replace(/[^A-Za-z0-9-]/g, '_');
  const evidencePath = `evidence/minfin-${safe}-${act.act_date}.html`;

  const priceLines = Object.entries(act.prices_byn_per_gram)
    .map(([fineness, price]) => `| ${fineness} | ${price.toFixed(2).replace('.', ',')} |`)
    .join('\n');

  const warningBlock =
    warnings.length === 0
      ? '_Парсер замечаний не оставил._'
      : warnings.map((warning) => `- **${warning.kind}** — ${warning.message}`).join('\n');

  const body = [
    `На странице Минфина появилось постановление **№ ${act.act_number}** от ${act.act_date}.`,
    '',
    '## Этот PR нельзя слить как есть',
    '',
    'Проверка данных на нём **красная, и так задумано**. На странице министерства',
    'нет ни даты вступления в силу, ни срока действия — обе живут в тексте самого',
    'акта. Воркер оставил на их месте `null`.',
    '',
    '### Что сделать',
    '',
    '1. Открыть сам акт (не эту страницу, не новость о нём).',
    '2. Вписать `effective_from` — дату вступления в силу.',
    '3. Вписать `stated_expiry` — дату, по которую акт действует.',
    '   **Если срок в акте не назван — оставить `null`.** Выдумывать нельзя.',
    '4. Вписать `transcribed_by` — кто сверял.',
    '5. Сверить цены в таблице ниже с таблицей в акте, глазами.',
    '6. Убедиться, что проверка позеленела, и слить.',
    '',
    '## Что прочитал парсер',
    '',
    '| проба | BYN за грамм |',
    '|---|---|',
    priceLines,
    '',
    '## Замечания парсера',
    '',
    warningBlock,
    '',
    '## Доказательство',
    '',
    `Сырой HTML страницы на момент проверки — в \`${evidencePath}\` этой же ветки.`,
    `Источник: ${sourceUrl}`,
    `Прочитано: ${checkedAt}`,
    '',
    '---',
    '',
    '_Открыто автоматически. Ни одна цифра не попадёт на сайт без слияния этого PR._',
  ].join('\n');

  return {
    title: `Минфин: постановление № ${act.act_number} от ${act.act_date}`,
    body,
    commitMessage: `Черновик: постановление № ${act.act_number} от ${act.act_date}\n\nСобрано автоматически. Даты вступления в силу и срока действия\nне заполнены — их нет на странице источника.`,
    evidencePath,
  };
}

/** Текст issue, когда разбор не удался. */
export function failureIssueTexts(
  reason: string,
  detail: string,
  sourceUrl: string,
  checkedAt: string,
): { title: string; body: string } {
  return {
    title: `Парсер Минфина не справился: ${reason}`,
    body: [
      'Проверка страницы Минфина завершилась отказом разбора.',
      '',
      `- **Причина:** \`${reason}\``,
      `- **Подробности:** ${detail}`,
      `- **Источник:** ${sourceUrl}`,
      `- **Когда:** ${checkedAt}`,
      '',
      'Публикация заблокирована флагом `block:publish` в KV: пока он стоит,',
      'воркер не будет предлагать изменения, даже если следующая проверка',
      'разберётся. Это защита от случая, когда вёрстка поменялась так, что',
      'парсер читает не ту таблицу и цифры выглядят правдоподобно.',
      '',
      '### Что сделать',
      '',
      '1. Открыть страницу руками и посмотреть, что изменилось.',
      '2. Починить парсер и добавить фикстуру на этот случай.',
      '3. Снять флаг: `wrangler kv key delete --binding REPORTS "block:publish"`.',
      '',
      '_Заведено автоматически._',
    ].join('\n'),
  };
}
