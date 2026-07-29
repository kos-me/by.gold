/**
 * What does a built page show on a date later than the day it was built?
 *
 * The site is static, so its state is decided at build time — but the state
 * depends on today's date. This drives a real browser over one served build
 * with the clock faked to several dates and reports what the price card says.
 * Nothing about the build changes between runs; only the browser's idea of
 * today does.
 *
 * It exists to check one specific claim: that a build left running past its
 * act's end date goes quiet rather than quoting a lapsed price, and that it
 * cannot show a successor's price without being rebuilt.
 *
 * Run:
 *   npm run build && npx serve dist -l 4399
 *   node scripts/clock.mjs http://localhost:4399/ 2026-07-31 2026-08-01
 *
 * Drives an already-installed Chrome; downloads none of its own.
 */

import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

const [, , url, ...dates] = process.argv;

if (url === undefined || dates.length === 0) {
  console.error('usage: node scripts/clock.mjs <url> <YYYY-MM-DD> [YYYY-MM-DD ...]');
  process.exit(2);
}

const chrome = CHROME_CANDIDATES.find((path) => existsSync(path));
if (chrome === undefined) {
  console.error('No Chrome or Chromium found. Install one, or edit CHROME_CANDIDATES.');
  process.exit(2);
}

const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new' });

for (const date of dates) {
  const page = await browser.newPage();

  // Freeze the clock before any of the page's own script runs, so the staleness
  // guard sees the faked date on its first and only look.
  await page.evaluateOnNewDocument((iso) => {
    const fixed = new Date(iso).getTime();
    const Real = Date;
    class Faked extends Real {
      constructor(...args) {
        super(...(args.length === 0 ? [fixed] : args));
      }
      static now() {
        return fixed;
      }
    }
    globalThis.Date = Faked;
  }, `${date}T09:00:00Z`);

  await page.goto(url, { waitUntil: 'networkidle0' });

  const seen = await page.evaluate(() => {
    const text = (selector) =>
      document.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
    const visible = (selector) => {
      const element = document.querySelector(selector);
      return element !== null && element.offsetParent !== null;
    };
    const shownNote = [...document.querySelectorAll('[data-stale-note]')].find(
      (element) => element.offsetParent !== null,
    );
    return {
      figure: visible('[data-when-fresh]') ? text('.price__value') : null,
      absence: visible('[data-when-stale]')
        ? `${shownNote?.dataset.staleNote ?? 'none'}: ${shownNote?.textContent?.trim() ?? ''}`
        : null,
      headlineRow: text('[data-tariff-row="585"] .tariff-row__price'),
      calculatorDisabled: document.querySelector('[data-calc-mass]')?.disabled ?? null,
      priceDataInDom: document.querySelector('#tariff-payload') !== null,
    };
  });

  console.log(`\n${date}`);
  console.log(`  headline figure ....... ${seen.figure ?? '— withheld —'}`);
  if (seen.absence !== null) console.log(`  instead says .......... ${seen.absence}`);
  console.log(`  585 row in the table .. ${seen.headlineRow}`);
  console.log(`  calculator disabled ... ${seen.calculatorDisabled}`);
  console.log(`  price data in the DOM . ${seen.priceDataInDom}`);

  await page.close();
}

await browser.close();
