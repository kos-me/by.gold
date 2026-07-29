/**
 * Скачивает шрифты с Google Fonts в `public/fonts/` и генерирует
 * `src/styles/fonts.css` со ссылками на локальные файлы.
 *
 * Зачем: макет ссылался на CDN Google Fonts. Для продакшена шрифты нужны
 * свои — и ради скорости, и ради того, чтобы страница не звала третью
 * сторону на каждом заходе.
 *
 * Сабсет задаётся параметром `text=`: Google Fonts возвращает файл ровно
 * с перечисленными глифами. Готовые диапазоны `cyrillic` + `latin` дают
 * 333 КБ на три семейства — это весь бюджет страницы и ещё сверху.
 * Свой набор укладывается примерно в пятую часть.
 *
 * Запуск: `node scripts/fetch-fonts.mjs`. Не часть сборки — результат
 * коммитится, чтобы `npm run build` не ходил в сеть.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const FONT_DIR = resolve(ROOT, 'public/fonts');
const CSS_OUT = resolve(ROOT, 'src/styles/fonts.css');

const RUSSIAN = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя';
const BELARUSIAN_EXTRA = 'іўґ'; // встречаются в названиях и цитатах
const LATIN = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';

/**
 * Знаки препинания и символы. `№` и `×` названы в задании явно; тире, кавычки
 * и стрелка — из макета. Неразрывный пробел и мягкий перенос нужны, иначе
 * в них проваливается вёрстка чисел.
 */
const PUNCTUATION = [
  ' !"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~',
  ' ', // неразрывный пробел — разделитель тысяч
  '­', // мягкий перенос
  '  ', // тонкий и узкий неразрывный пробел
  '«»„“”‘’', // кавычки
  '—–‑', // тире и неразрывный дефис
  '…·•', // многоточие и точки
  '№§°%‰', // символы
  '×÷±≈≤≥', // математика
  '→←↑↓', // стрелки из макета
  '✓✔', // галочки
  '₽€$', // валюта: BYN пишется буквами, но символы дешевле, чем засечка
].join('');

const SUBSET_TEXT = [
  RUSSIAN,
  RUSSIAN.toUpperCase(),
  BELARUSIAN_EXTRA,
  BELARUSIAN_EXTRA.toUpperCase(),
  LATIN,
  LATIN.toUpperCase(),
  DIGITS,
  PUNCTUATION,
].join('');

const FAMILIES = [
  { name: 'Onest', weights: [700, 800] },
  { name: 'Golos Text', weights: [400, 500, 600] },
  { name: 'Martian Mono', weights: [400, 500] },
];

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function cssUrl(family, weight) {
  const name = family.replace(/ /g, '+');
  return (
    `https://fonts.googleapis.com/css2?family=${name}:wght@${weight}` +
    `&text=${encodeURIComponent(SUBSET_TEXT)}&display=swap`
  );
}

function fileNameFor(family, weight) {
  return `${family.toLowerCase().replace(/\s+/g, '-')}-${weight}.woff2`;
}

async function main() {
  await mkdir(FONT_DIR, { recursive: true });

  const rules = [];
  let totalBytes = 0;

  for (const { name, weights } of FAMILIES) {
    for (const weight of weights) {
      const cssResponse = await fetch(cssUrl(name, weight), { headers: { 'User-Agent': UA } });
      if (!cssResponse.ok) throw new Error(`${name} ${weight}: CSS → ${cssResponse.status}`);
      const css = await cssResponse.text();

      // При `text=` Google отдаёт файл не по «красивому» пути, а через
      // /l/font?kit=…, так что опираемся на format('woff2'), а не на суффикс.
      const url = /url\((https:\/\/[^)]+)\)\s*format\('woff2'\)/.exec(css)?.[1];
      if (!url) throw new Error(`${name} ${weight}: в ответе нет woff2\n${css}`);

      const range = /unicode-range:\s*([^;]+);/.exec(css)?.[1]?.trim();

      // Сколько @font-face вернулось: при `text=` должен быть ровно один.
      // Несколько означало бы, что сабсет не применился и приехали диапазоны.
      const faceCount = (css.match(/@font-face/g) ?? []).length;
      if (faceCount !== 1) {
        throw new Error(`${name} ${weight}: ожидался один @font-face, пришло ${faceCount}`);
      }

      const fileResponse = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!fileResponse.ok) throw new Error(`${name} ${weight}: файл → ${fileResponse.status}`);
      const bytes = new Uint8Array(await fileResponse.arrayBuffer());

      const fileName = fileNameFor(name, weight);
      await writeFile(resolve(FONT_DIR, fileName), bytes);
      totalBytes += bytes.byteLength;
      console.log(`  ${fileName.padEnd(28)} ${(bytes.byteLength / 1024).toFixed(1)} КБ`);

      rules.push(
        [
          `/* ${name} ${weight} */`,
          '@font-face {',
          `  font-family: '${name}';`,
          '  font-style: normal;',
          `  font-weight: ${weight};`,
          '  font-display: swap;',
          `  src: url('/fonts/${fileName}') format('woff2');`,
          ...(range === undefined ? [] : [`  unicode-range: ${range};`]),
          '}',
        ].join('\n'),
      );
    }
  }

  const header = [
    '/*',
    ' * Сгенерировано `node scripts/fetch-fonts.mjs`. Руками не править.',
    ' *',
    ' * Сабсет: кириллица (русская + і/ў), латиница, цифры, пунктуация,',
    ` * № — · × и прочее из макета. Всего ${(totalBytes / 1024).toFixed(1)} КБ на семь начертаний.`,
    ' * Шрифты под SIL Open Font License; файлы в public/fonts/.',
    ' *',
    ' * Символ вне сабсета отрисуется системным шрифтом — заметно, но не сломано.',
    ' * Если такой понадобится, добавить его в SUBSET_TEXT и перегенерировать.',
    ' */',
    '',
  ].join('\n');

  await writeFile(CSS_OUT, `${header}\n${rules.join('\n\n')}\n`, 'utf8');
  console.log(`\nВсего ${(totalBytes / 1024).toFixed(1)} КБ → src/styles/fonts.css`);
}

await main();
