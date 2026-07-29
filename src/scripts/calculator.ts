/**
 * Поведение калькулятора в браузере.
 *
 * Вся арифметика — в `src/lib/calc.ts`, здесь только связь с разметкой.
 * Скрипт не запускается вовсе, если действующего постановления нет: в этом
 * состоянии поля выключены на сервере, и включать их нечем.
 *
 * Хранилищ не трогаем — ни localStorage, ни sessionStorage.
 */

import { calculate, failureText, formatKopecks, isEmptyInput } from '../lib/calc.ts';
import type { FinenessKey } from '../lib/schema.ts';

interface TariffPayload {
  readonly prices: Partial<Record<FinenessKey, number>>;
  readonly headline: FinenessKey;
}

function readPayload(): TariffPayload | null {
  const node = document.getElementById('tariff-payload');
  if (node === null || node.textContent === null) return null;
  try {
    return JSON.parse(node.textContent) as TariffPayload;
  } catch {
    // Испорченный payload — не повод показать неверную сумму.
    return null;
  }
}

function init(): void {
  const payload = readPayload();
  if (payload === null) return;

  const input = document.querySelector<HTMLInputElement>('[data-calc-mass]');
  const chips = [...document.querySelectorAll<HTMLButtonElement>('[data-calc-fineness]')];
  const output = document.querySelector<HTMLElement>('[data-calc-value]');
  const row = (fineness: string): HTMLElement | null =>
    document.querySelector<HTMLElement>(`[data-tariff-row="${fineness}"]`);

  if (input === null || output === null || chips.length === 0) return;

  let fineness: FinenessKey = payload.headline;

  function render(): void {
    if (input === null || output === null) return;

    const result = calculate(input.value, fineness, payload!.prices);

    if (result.ok) {
      output.textContent = `${formatKopecks(result.totalKopecks)} BYN`;
      output.dataset['kind'] = 'sum';
      input.removeAttribute('aria-invalid');
      return;
    }

    output.textContent = failureText(result.failure);
    // Пустое поле — не ошибка: человек просто ещё не ввёл массу.
    output.dataset['kind'] = isEmptyInput(result.failure) ? 'hint' : 'error';
    if (isEmptyInput(result.failure)) input.removeAttribute('aria-invalid');
    else input.setAttribute('aria-invalid', 'true');
  }

  function selectFineness(next: FinenessKey): void {
    fineness = next;
    for (const chip of chips) {
      chip.setAttribute('aria-pressed', String(chip.dataset['calcFineness'] === next));
    }
    // Подсветка строки в таблице проб — та же связь, что в макете.
    for (const chip of chips) {
      const key = chip.dataset['calcFineness'];
      if (key === undefined) continue;
      row(key)?.classList.toggle('tariff-row--selected', key === next);
    }
    render();
  }

  input.addEventListener('input', render);
  for (const chip of chips) {
    chip.addEventListener('click', () => {
      const next = chip.dataset['calcFineness'];
      if (next !== undefined) selectFineness(next as FinenessKey);
    });
  }

  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
