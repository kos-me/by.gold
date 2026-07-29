/**
 * Which QUESTIONS.md items are answered and which aren't.
 *
 * Read-only: it prints and changes nothing. Exists so that "track what got
 * answered" doesn't mean re-reading the whole document each time.
 *
 * Run: node scripts/answers.mjs
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DOC = resolve(import.meta.dirname, '..', 'QUESTIONS.md');

/** Both spellings, so switching the document's language doesn't break this. */
const UNANSWERED = ['_(unanswered)_', '_(не отвечено)_'];
const ANSWER_LINE = /^\*\*(?:Answer|Ответ):\*\*\s*(.*)$/;

const text = readFileSync(DOC, 'utf8');
const lines = text.split('\n');

/** Items of the form `## B1. Title` and `## D3. Title`. */
const items = [];
let current = null;

for (const line of lines) {
  const heading = /^##\s+([BD]\d+)\.\s+(.+?)\s*$/.exec(line);
  if (heading !== null) {
    current = { id: heading[1], title: heading[2], answer: null };
    items.push(current);
    continue;
  }
  const answer = ANSWER_LINE.exec(line);
  if (answer !== null && current !== null && current.answer === null) {
    current.answer = (answer[1] ?? '').trim();
  }
}

if (items.length === 0) {
  console.error('No items found in QUESTIONS.md — has the heading format changed?');
  process.exit(2);
}

const answered = items.filter(
  (item) => item.answer !== null && item.answer !== '' && !UNANSWERED.includes(item.answer),
);
const pending = items.filter((item) => !answered.includes(item));

const blockers = pending.filter((item) => item.id.startsWith('B'));

function show(list, mark) {
  for (const item of list) {
    const tail =
      item.answer && !UNANSWERED.includes(item.answer) ? `  → ${item.answer.slice(0, 70)}` : '';
    console.log(`  ${mark} ${item.id.padEnd(4)} ${item.title}${tail}`);
  }
}

console.log(`\nQUESTIONS.md — ${items.length} items\n`);

if (answered.length > 0) {
  console.log(`Answered (${answered.length}):`);
  show(answered, '✓');
  console.log('');
}

if (pending.length > 0) {
  console.log(`Waiting (${pending.length}):`);
  show(pending, '·');
  console.log('');
}

if (blockers.length > 0) {
  console.log(`Blocking among them: ${blockers.map((item) => item.id).join(', ')}`);
} else if (pending.length > 0) {
  console.log('No blockers left unanswered.');
} else {
  console.log('Everything answered.');
}
console.log('');
