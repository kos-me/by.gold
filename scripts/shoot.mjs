/**
 * Screenshots pages and checks for horizontal overflow.
 *
 * The brief demands 360px and "tables wrap rather than scroll sideways". That
 * needs a machine to check: a block clipped by one pixel is invisible to the
 * eye but turns into a sideways scroll of the whole page on a phone.
 *
 * Run:
 *   node scripts/shoot.mjs <baseUrl> <outDir> [path ...]
 *
 * Drives an already-installed Chrome; downloads none of its own.
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
  if (found === undefined) throw new Error('Chrome was not found at any known path');
  return found;
}

/** Elements spilling past the right edge. Returns descriptions, not nodes. */
function collectOverflow() {
  const limit = document.documentElement.clientWidth;
  const offenders = [];
  for (const el of document.querySelectorAll('*')) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (rect.right <= limit + 0.5) continue;
    // Only the deepest offender is interesting, not all its ancestors.
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
    // No cache: otherwise a repeat visit gets a 304 and shoots stale markup.
    await page.setCacheEnabled(false);
    const response = await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle0' });
    if (response === null || response.status() >= 400) {
      console.error(`✗ ${path} @${width} → HTTP ${response?.status() ?? 'no response'}`);
      failures += 1;
      await page.close();
      continue;
    }
    await page.evaluate(() => document.fonts.ready);

    // A full-page screenshot does not scroll, so loading="lazy" images below
    // the fold never load and come out blank. On the site that is correct
    // behaviour; here we must scroll to see the real page. Changing the
    // attribute after the fact does not trigger a load — only scrolling does.
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
        `✗ ${path} @${width}px — page wider than the viewport: ${report.scrollWidth} > ${report.clientWidth}`,
      );
      for (const item of report.offenders) {
        console.error(
          `    ${item.tag}.${item.cls} — right edge ${item.right}, width ${item.width}` +
            (item.text ? `  "${item.text}"` : ''),
        );
      }
    } else {
      console.log(`✓ ${path} @${width}px`);
    }
    await page.close();
  }
}

await browser.close();
console.log(failures === 0 ? '\nNo overflow.' : `\nProblems: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
