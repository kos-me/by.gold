/**
 * Проверка калькулятора в настоящем браузере.
 *
 * Юнит-тесты проверяют арифметику, но не то, что разметка, скрипт и данные
 * состыкованы. Здесь проверяется именно стыковка: ввод массы даёт сумму,
 * переключение пробы её меняет, мусор не превращается в число, а в состоянии
 * без действующего постановления поля выключены и остаются выключенными.
 *
 * Запуск: node scripts/smoke.mjs <urlValid> <urlWithheld> [urlAbout]
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
  console.error('Использование: node scripts/smoke.mjs <urlValid> <urlWithheld>');
  process.exit(2);
}

const chrome = CHROME_CANDIDATES.find((path) => existsSync(path));
if (chrome === undefined) throw new Error('Chrome не найден');

let failures = 0;

function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `\n    ожидалось «${expected}», получено «${actual}»`}`);
}

const browser = await puppeteer.launch({ executablePath: chrome, headless: true });

// --- состояние с действующим постановлением --------------------------------
{
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.goto(validUrl, { waitUntil: 'networkidle0' });

  const value = async () => page.$eval('[data-calc-value]', (el) => el.textContent?.trim() ?? '');
  const kind = async () => page.$eval('[data-calc-value]', (el) => el.dataset.kind ?? '');

  check('пустое поле — подсказка, не ошибка', await value(), 'введите массу');
  check('пустое поле помечено как hint', await kind(), 'hint');

  // Фикстура: 585 проба = 4.10 BYN/г. 10 г → 41,00.
  await page.type('[data-calc-mass]', '10');
  check('10 г по 585 пробе', await value(), '41,00 BYN');
  check('результат помечен как сумма', await kind(), 'sum');

  // Переключение на 999 (7.40 BYN/г): 10 г → 74,00.
  await page.click('[data-calc-fineness="999"]');
  check('переключение пробы пересчитывает', await value(), '74,00 BYN');

  const pressed = await page.$eval('[data-calc-fineness="999"]', (el) =>
    el.getAttribute('aria-pressed'),
  );
  check('выбранная проба отмечена', pressed, 'true');

  const rowSelected = await page.$$eval('.tariff-row--selected .tariff-row__fineness', (nodes) =>
    nodes.map((n) => n.textContent?.trim()).join(','),
  );
  check('подсвечена строка выбранной пробы', rowSelected, '999');

  // Запятая как разделитель.
  await page.$eval('[data-calc-mass]', (el) => {
    el.value = '';
  });
  await page.type('[data-calc-mass]', '8,4');
  check('8,4 г по 999 пробе', await value(), '62,16 BYN');

  // Мусор не считается.
  await page.$eval('[data-calc-mass]', (el) => {
    el.value = '';
  });
  await page.type('[data-calc-mass]', 'много');
  check('мусор не превращается в сумму', await value(), 'только цифры');
  check('мусор помечен как ошибка', await kind(), 'error');

  const invalid = await page.$eval('[data-calc-mass]', (el) => el.getAttribute('aria-invalid'));
  check('поле помечено aria-invalid', invalid, 'true');

  await page.close();
}

// --- состояние без действующего постановления ------------------------------
{
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.goto(withheldUrl, { waitUntil: 'networkidle0' });

  const massDisabled = await page.$eval('[data-calc-mass]', (el) => el.disabled);
  check('поле массы выключено', massDisabled, true);

  const chipsDisabled = await page.$$eval('[data-calc-fineness]', (nodes) =>
    nodes.every((n) => n.disabled),
  );
  check('кнопки проб выключены', chipsDisabled, true);

  const shown = await page.$eval('[data-calc-value]', (el) => el.textContent?.trim() ?? '');
  check('сумма не показана', shown, '—');

  const payload = await page.$('#tariff-payload');
  check('цен в разметке нет вовсе', payload, null);

  // Ни одной цифры с BYN нигде на странице: ни в таблице, ни в архиве.
  const bynFigures = await page.evaluate(() => {
    const text = document.body.innerText;
    return (text.match(/\d+[.,]\d{2}\s*BYN/g) ?? []).length;
  });
  check('на странице нет ни одной суммы в BYN', bynFigures, 0);

  await page.close();
}

// --- форма сообщения об ошибке ---------------------------------------------
if (aboutUrl !== undefined) {
  const page = await browser.newPage();
  await page.setCacheEnabled(false);

  const visible = (selector) =>
    page.$eval(selector, (el) => el.offsetParent !== null || el.getClientRects().length > 0);
  const invalidText = () =>
    page.$eval('[data-report-invalid-text]', (el) => el.textContent?.trim() ?? '');

  // 1. Неполный адрес почты.
  await page.goto(aboutUrl, { waitUntil: 'networkidle0' });
  await page.type('#report-email', 'не-почта');
  await page.type('#report-note', 'В скупке назвали цену ниже постановления');
  await page.click('[data-report-submit]');
  await page.waitForSelector('[data-report-invalid]:not([hidden])', { timeout: 3000 });
  check(
    'неполная почта — своя формулировка',
    (await invalidText()).startsWith('Адрес почты'),
    true,
  );

  // 2. Слишком короткое описание.
  await page.goto(aboutUrl, { waitUntil: 'networkidle0' });
  await page.type('#report-email', 'chelovek@mail.by');
  await page.type('#report-note', 'ошибка');
  await page.click('[data-report-submit]');
  await page.waitForSelector('[data-report-invalid]:not([hidden])', { timeout: 3000 });
  check(
    'короткое описание — своя формулировка',
    (await invalidText()).startsWith('Опишите расхождение'),
    true,
  );

  // 3. Воркера нет: /api/contact не отвечает → состояние «не отправилось»,
  //    и текст пользователя обязан остаться в поле.
  await page.goto(aboutUrl, { waitUntil: 'networkidle0' });
  const written = 'Постановление № 12: на главной цена не та, что в акте';
  await page.type('#report-email', 'chelovek@mail.by');
  await page.type('#report-note', written);
  await page.click('[data-report-submit]');
  await page.waitForSelector('[data-report-failed]:not([hidden])', { timeout: 8000 });
  check('без воркера — состояние «не отправилось»', await visible('[data-report-failed]'), true);

  // 4. Возврат к форме сохраняет написанное.
  await page.click('[data-report-retry]');
  const preserved = await page.$eval('#report-note', (el) => el.value);
  check('текст пользователя не потерян', preserved, written);

  // 5. Ловушка для ботов не видна человеку и не читается скринридером.
  const honeypot = await page.$eval('#report-city', (el) => {
    const rect = el.getBoundingClientRect();
    return {
      offScreen: rect.right < 0 || rect.bottom < 0,
      ariaHidden: el.closest('[aria-hidden="true"]') !== null,
      notTabbable: el.tabIndex < 0,
    };
  });
  check('ловушка уведена за экран', honeypot.offScreen, true);
  check('ловушка скрыта от скринридера', honeypot.ariaHidden, true);
  check('ловушка не получает фокус табом', honeypot.notTabbable, true);

  await page.close();
}

await browser.close();
console.log(failures === 0 ? '\nВсё сходится.' : `\nНе сошлось: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
