/**
 * Checks the calculator in a real browser.
 *
 * Unit tests cover the arithmetic but not whether the markup, the script and
 * the data are wired together. This checks exactly that wiring: typing a mass
 * yields a sum, switching fineness changes it, garbage does not become a
 * number, and with no decree in force the fields are disabled and stay so.
 *
 * Run: node scripts/smoke.mjs <urlValid> <urlWithheld> [urlAbout]
 */

import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

const [, , validUrl, withheldUrl, aboutUrl] = process.argv;
if (validUrl === undefined || withheldUrl === undefined) {
  console.error('Usage: node scripts/smoke.mjs <urlValid> <urlWithheld> [urlAbout]');
  process.exit(2);
}

const chrome = CHROME_CANDIDATES.find((path) => existsSync(path));
if (chrome === undefined) throw new Error('Chrome was not found');

let failures = 0;

function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `\n    expected "${expected}", got "${actual}"`}`);
}

const browser = await puppeteer.launch({ executablePath: chrome, headless: true });

// --- the state with a decree in force ---------------------------------------
{
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.goto(validUrl, { waitUntil: 'networkidle0' });

  const value = async () => page.$eval('[data-calc-value]', (el) => el.textContent?.trim() ?? '');
  const kind = async () => page.$eval('[data-calc-value]', (el) => el.dataset.kind ?? '');

  check('empty field shows a hint, not an error', await value(), 'введите массу');
  check('empty field is marked as a hint', await kind(), 'hint');

  /*
   * Expected sums are derived from the prices the server rendered into the
   * fineness table rather than hard-coded. That is not fitting the test to
   * the fixture: Astro renders the table at build time and the browser script
   * computes the sum, so two independent paths have to agree. It also means
   * the test survives an edit to the fixture.
   */
  const tablePrices = await page.$$eval('[data-tariff-row]', (rows) =>
    Object.fromEntries(
      rows.map((row) => [
        row.dataset.tariffRow,
        row.querySelector('.tariff-row__price')?.textContent?.trim() ?? '',
      ]),
    ),
  );

  const toNumber = (shown) => Number(shown.replace(/\s/g, '').replace(',', '.'));
  const money = (value) =>
    `${Math.round(value * 100 + Number.EPSILON) / 100}`
      .replace('.', ',')
      .replace(/^(\d+)$/, '$1,00')
      .replace(/,(\d)$/, ',$10');

  const finenesses = Object.keys(tablePrices);
  const headline = '585';
  const other = finenesses.find((key) => key !== headline) ?? headline;

  const priceOf = (key) => toNumber(tablePrices[key]);

  await page.type('[data-calc-mass]', '10');
  check(`10 g at fineness ${headline}`, await value(), `${money(priceOf(headline) * 10)} BYN`);
  check('result is marked as a sum', await kind(), 'sum');

  await page.click(`[data-calc-fineness="${other}"]`);
  check('switching fineness recomputes', await value(), `${money(priceOf(other) * 10)} BYN`);

  const pressed = await page.$eval(`[data-calc-fineness="${other}"]`, (el) =>
    el.getAttribute('aria-pressed'),
  );
  check('the selected fineness is marked', pressed, 'true');

  const rowSelected = await page.$$eval('.tariff-row--selected .tariff-row__fineness', (nodes) =>
    nodes.map((n) => n.textContent?.trim()).join(','),
  );
  check('the selected fineness row is highlighted', rowSelected, other);

  // Comma as the separator.
  await page.$eval('[data-calc-mass]', (el) => {
    el.value = '';
  });
  await page.type('[data-calc-mass]', '8,4');
  check(`8,4 g at fineness ${other}`, await value(), `${money(priceOf(other) * 8.4)} BYN`);

  // Garbage does not compute.
  await page.$eval('[data-calc-mass]', (el) => {
    el.value = '';
  });
  await page.type('[data-calc-mass]', 'много');
  check('garbage does not become a sum', await value(), 'только цифры');
  check('garbage is marked as an error', await kind(), 'error');

  const invalid = await page.$eval('[data-calc-mass]', (el) => el.getAttribute('aria-invalid'));
  check('the field is marked aria-invalid', invalid, 'true');

  await page.close();
}

// --- the state with no decree in force --------------------------------------
{
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.goto(withheldUrl, { waitUntil: 'networkidle0' });

  const massDisabled = await page.$eval('[data-calc-mass]', (el) => el.disabled);
  check('the mass field is disabled', massDisabled, true);

  const chipsDisabled = await page.$$eval('[data-calc-fineness]', (nodes) =>
    nodes.every((n) => n.disabled),
  );
  check('the fineness buttons are disabled', chipsDisabled, true);

  const shown = await page.$eval('[data-calc-value]', (el) => el.textContent?.trim() ?? '');
  check('no sum is shown', shown, '—');

  const payload = await page.$('#tariff-payload');
  check('no prices in the markup at all', payload, null);

  /*
   * No CURRENT price anywhere in the price card. The archive figure, the
   * history rows and the bullion table are a different matter: they are
   * labelled as past or as another regime, and the withheld design shows them
   * on purpose. What must not appear is a figure presented as today's.
   */
  const priceCard = await page.evaluate(() => {
    const card = document.querySelector('.card');
    const text = card === null ? '' : card.innerText;
    return {
      sums: (text.match(/\d+[.,]\d{2}\s*BYN/g) ?? []).length,
      dashedRows: [...document.querySelectorAll('[data-tariff-row] .tariff-row__price')]
        .every((el) => el.textContent.trim() === '—'),
      headlineVisible: (() => {
        const el = document.querySelector('.price__value');
        return el !== null && el.offsetParent !== null;
      })(),
    };
  });
  check('the price card carries no BYN sum', priceCard.sums, 0);
  check('every fineness row is dashed', priceCard.dashedRows, true);
  check('no headline figure is shown', priceCard.headlineVisible, false);

  await page.close();
}

// --- the error-report form ---------------------------------------------------
if (aboutUrl !== undefined) {
  const page = await browser.newPage();
  await page.setCacheEnabled(false);

  const visible = (selector) =>
    page.$eval(selector, (el) => el.offsetParent !== null || el.getClientRects().length > 0);
  const invalidText = () =>
    page.$eval('[data-report-invalid-text]', (el) => el.textContent?.trim() ?? '');

  // 1. Incomplete email address.
  await page.goto(aboutUrl, { waitUntil: 'networkidle0' });
  await page.type('#report-email', 'не-почта');
  await page.type('#report-note', 'В скупке назвали цену ниже постановления');
  await page.click('[data-report-submit]');
  await page.waitForSelector('[data-report-invalid]:not([hidden])', { timeout: 3000 });
  check(
    'incomplete email gives our own wording',
    (await invalidText()).startsWith('Адрес почты'),
    true,
  );

  // 2. Description too short.
  await page.goto(aboutUrl, { waitUntil: 'networkidle0' });
  await page.type('#report-email', 'chelovek@mail.by');
  await page.type('#report-note', 'ошибка');
  await page.click('[data-report-submit]');
  await page.waitForSelector('[data-report-invalid]:not([hidden])', { timeout: 3000 });
  check(
    'short description gives our own wording',
    (await invalidText()).startsWith('Опишите расхождение'),
    true,
  );

  // 3. No worker: /api/contact does not answer → the "didn't send" state,
  //    and the person's text must stay in the field.
  await page.goto(aboutUrl, { waitUntil: 'networkidle0' });
  const written = 'Постановление № 12: на главной цена не та, что в акте'; // Russian input on purpose
  await page.type('#report-email', 'chelovek@mail.by');
  await page.type('#report-note', written);
  await page.click('[data-report-submit]');
  await page.waitForSelector('[data-report-failed]:not([hidden])', { timeout: 8000 });
  check('with no worker the "didn\'t send" state shows', await visible('[data-report-failed]'), true);

  // 4. Returning to the form preserves what was written.
  await page.click('[data-report-retry]');
  const preserved = await page.$eval('#report-note', (el) => el.value);
  check('the person\'s text is not lost', preserved, written);

  // 5. The bot honeypot is invisible to a person and to a screen reader.
  const honeypot = await page.$eval('#report-city', (el) => {
    const rect = el.getBoundingClientRect();
    return {
      offScreen: rect.right < 0 || rect.bottom < 0,
      ariaHidden: el.closest('[aria-hidden="true"]') !== null,
      notTabbable: el.tabIndex < 0,
    };
  });
  check('the honeypot is moved off-screen', honeypot.offScreen, true);
  check('the honeypot is hidden from screen readers', honeypot.ariaHidden, true);
  check('the honeypot is not reachable by tab', honeypot.notTabbable, true);

  await page.close();
}

await browser.close();
console.log(failures === 0 ? '\nEverything agrees.' : `\nDisagreements: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
