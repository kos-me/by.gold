/**
 * Что в QUESTIONS.md отвечено, а что нет.
 *
 * Ничего не меняет — только читает и печатает. Нужен, чтобы «следить, на что
 * ответили» не превращалось в перечитывание документа целиком.
 *
 * Запуск: node scripts/answers.mjs
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DOC = resolve(import.meta.dirname, '..', 'QUESTIONS.md');
const UNANSWERED = '_(не отвечено)_';

const text = readFileSync(DOC, 'utf8');
const lines = text.split('\n');

/** Пункты вида «## B1. Заголовок» и «## D3. Заголовок». */
const items = [];
let current = null;

for (const line of lines) {
  const heading = /^##\s+([BD]\d+)\.\s+(.+?)\s*$/.exec(line);
  if (heading !== null) {
    current = { id: heading[1], title: heading[2], answer: null };
    items.push(current);
    continue;
  }
  const answer = /^\*\*Ответ:\*\*\s*(.*)$/.exec(line);
  if (answer !== null && current !== null && current.answer === null) {
    current.answer = (answer[1] ?? '').trim();
  }
}

if (items.length === 0) {
  console.error('В QUESTIONS.md не нашлось ни одного пункта. Формат заголовков сломан?');
  process.exit(2);
}

const answered = items.filter(
  (item) => item.answer !== null && item.answer !== '' && item.answer !== UNANSWERED,
);
const pending = items.filter((item) => !answered.includes(item));

const blockers = pending.filter((item) => item.id.startsWith('B'));

function show(list, mark) {
  for (const item of list) {
    const tail = item.answer && item.answer !== UNANSWERED ? `  → ${item.answer.slice(0, 70)}` : '';
    console.log(`  ${mark} ${item.id.padEnd(4)} ${item.title}${tail}`);
  }
}

console.log(`\nQUESTIONS.md — пунктов ${items.length}\n`);

if (answered.length > 0) {
  console.log(`Отвечено (${answered.length}):`);
  show(answered, '✓');
  console.log('');
}

if (pending.length > 0) {
  console.log(`Ждёт ответа (${pending.length}):`);
  show(pending, '·');
  console.log('');
}

if (blockers.length > 0) {
  console.log(`Из них блокирует: ${blockers.map((item) => item.id).join(', ')}`);
} else if (pending.length > 0) {
  console.log('Блокирующих среди неотвеченных нет.');
} else {
  console.log('Отвечено всё.');
}
console.log('');
