/**
 * Calculator behaviour in the browser.
 *
 * All the arithmetic lives in `src/lib/calc.ts`; this file only wires it to
 * the markup. The script never runs at all when no decree is in force: in
 * that state the fields are disabled server-side and there is nothing to
 * enable them with.
 *
 * No storage is touched — neither localStorage nor sessionStorage.
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
    // A corrupt payload is no reason to show a wrong sum.
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
    // An empty field is not an error: the person simply hasn't typed a mass.
    output.dataset['kind'] = isEmptyInput(result.failure) ? 'hint' : 'error';
    if (isEmptyInput(result.failure)) input.removeAttribute('aria-invalid');
    else input.setAttribute('aria-invalid', 'true');
  }

  function selectFineness(next: FinenessKey): void {
    fineness = next;
    for (const chip of chips) {
      chip.setAttribute('aria-pressed', String(chip.dataset['calcFineness'] === next));
    }
    // Highlighting the row in the fineness table — the same link as in the mockup.
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
