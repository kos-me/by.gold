/**
 * Съёмка страниц и проверка на горизонтальное переполнение.
 *
 * Бриф требует 360px и «таблицы переносятся, а не скроллятся вбок». Это надо
 * проверять машиной: на глаз обрезанный на пиксель блок не виден, а на
 * телефоне превращается в горизонтальный скролл всей страницы.
 *
 * Запуск:
 *   node scripts/shoot.mjs <baseUrl> <outDir> [путь ...]
 *
 * Драйвит уже установленный Chrome, свой не качает.
 */

import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

const WIDTHS = [360, 768, 1200];

const [, , baseUrl = 'http://localhost:4399', outDir = 'shots', ...paths] = process.argv;
const PAGES = paths.length > 0 ? paths : ['/'];

function findChrome() {
  const found = CHROME_CANDIDATES.find((path) => existsSync(path));
  if (found === undefined) throw new Error('Chrome не найден ни по одному из известных путей');
  return found;
}

/** Элементы, вылезающие за правый край окна. Возвращает описание, а не узлы. */
function collectOverflow() {
  const limit = document.documentElement.clientWidth;
  const offenders = [];
  for (const el of document.querySelectorAll('*')) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (rect.right <= limit + 0.5) continue;
    // Интересен самый глубокий виновник, а не все его предки.
    if ([...el.children].some((child) => child.getBoundingClientRect().right > limit + 0.5)) {
      continue;
    }
    offenders.push({
      tag: el.tagName.toLowerCase(),
      cls: typeof el.className === 'string' ? el.className.slice(0, 60) : '',
      right: Math.round(rect.right),
      width: Math.round(rect.width),
      text: (el.textContent ?? '').trim().slice(0, 45),
    });
  }
  return {
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: limit,
    offenders: offenders.slice(0, 12),
  };
}

const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: true,
  args: ['--hide-scrollbars', '--force-device-scale-factor=1'],
});

await mkdir(resolve(outDir), { recursive: true });
let failures = 0;

for (const path of PAGES) {
  for (const width of WIDTHS) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
    // Без кэша: иначе повторный заход отдаёт 304 и снимок берётся со старой вёрстки.
    await page.setCacheEnabled(false);
    const response = await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle0' });
    if (response === null || response.status() >= 400) {
      console.error(`✗ ${path} @${width} → HTTP ${response?.status() ?? 'нет ответа'}`);
      failures += 1;
      await page.close();
      continue;
    }
    await page.evaluate(() => document.fonts.ready);

    // Снимок всей страницы её не прокручивает, поэтому loading="lazy" ниже
    // сгиба так и остаётся незагруженным и кадр выходит пустым. На сайте это
    // правильное поведение; здесь надо прокрутить, чтобы увидеть настоящую
    // страницу. Смена атрибута постфактум загрузку не запускает — только скролл.
    await page.evaluate(async () => {
      const step = window.innerHeight;
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((done) => setTimeout(done, 60));
      }
      window.scrollTo(0, 0);
      await Promise.all(
        [...document.querySelectorAll('img')].map((img) =>
          img.complete
            ? img.decode().catch(() => {})
            : new Promise((done) => {
                img.addEventListener('load', done, { once: true });
                img.addEventListener('error', done, { once: true });
              }),
        ),
      );
    });

    const report = await page.evaluate(collectOverflow);
    const slug = path === '/' ? 'index' : path.replace(/^\//, '').replace(/\//g, '-');
    const file = resolve(outDir, `${slug}-${width}.png`);
    await page.screenshot({ path: file, fullPage: true });

    const overflows = report.scrollWidth > report.clientWidth;
    if (overflows) {
      failures += 1;
      console.error(
        `✗ ${path} @${width}px — страница шире окна: ${report.scrollWidth} > ${report.clientWidth}`,
      );
      for (const item of report.offenders) {
        console.error(
          `    ${item.tag}.${item.cls} — правый край ${item.right}, ширина ${item.width}` +
            (item.text ? `  «${item.text}»` : ''),
        );
      }
    } else {
      console.log(`✓ ${path} @${width}px`);
    }
    await page.close();
  }
}

await browser.close();
console.log(failures === 0 ? '\nПереполнений нет.' : `\nПроблем: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
