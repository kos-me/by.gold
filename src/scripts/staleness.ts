/**
 * Stale-build guard.
 *
 * The pages are static: the tariff state is decided when the site is built.
 * That is fine while something rebuilds it — the cron worker does — but a
 * build that stops being rebuilt would go on showing an expired figure as if
 * it were current. On this site that is the one unacceptable failure.
 *
 * So the browser checks the expiry again on every visit. Past it, the figure
 * is withheld and the calculator switches off, exactly as a fresh build in the
 * expired state would do. The explanatory copy is rendered by the server and
 * merely unhidden here — no sentence is assembled in JavaScript.
 *
 * This never turns anything back on. It can only take the figure away.
 */

import { isPastExpiry } from '../lib/date.ts';

function goQuiet(root: HTMLElement): void {
  // The headline figure and its hallmark: replaced by the server-rendered
  // "no figure" block sitting hidden next to them.
  for (const shown of root.querySelectorAll<HTMLElement>('[data-when-fresh]')) shown.hidden = true;
  for (const hidden of root.querySelectorAll<HTMLElement>('[data-when-stale]')) hidden.hidden = false;

  // Prices in the fineness table become dashes.
  for (const row of document.querySelectorAll<HTMLElement>('[data-tariff-row]')) {
    const price = row.querySelector<HTMLElement>('.tariff-row__price');
    if (price !== null) price.textContent = '—';
    row.classList.add('tariff-row--muted');
    row.classList.remove('tariff-row--selected');
  }

  // The calculator stops computing.
  const mass = document.querySelector<HTMLInputElement>('[data-calc-mass]');
  if (mass !== null) {
    mass.value = '';
    mass.disabled = true;
    mass.removeAttribute('aria-invalid');
  }
  for (const chip of document.querySelectorAll<HTMLButtonElement>('[data-calc-fineness]')) {
    chip.disabled = true;
  }
  const out = document.querySelector<HTMLElement>('[data-calc-value]');
  if (out !== null) {
    out.textContent = '—';
    out.dataset['kind'] = 'sum';
    out.closest('.calc__out')?.classList.add('calc__out--off');
  }
  for (const swap of document.querySelectorAll<HTMLElement>('[data-calc-stale-text]')) {
    const text = swap.dataset['calcStaleText'];
    if (text !== undefined && text !== '') swap.textContent = text;
  }

  // Remove the payload so nothing can compute from it later.
  document.getElementById('tariff-payload')?.remove();
}

function init(): void {
  const root = document.querySelector<HTMLElement>('[data-stale-guard]');
  if (root === null) return;
  const expiry = root.dataset['staleGuard'];
  if (expiry === undefined || expiry === '') return;
  if (isPastExpiry(expiry, new Date())) goQuiet(root);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
