/**
 * Stale-build guard.
 *
 * The pages are static: the tariff state is decided when the site is built.
 * That is fine while something rebuilds it — a scheduled job does — but a build
 * that stops being rebuilt would go on showing its figure as if it were
 * current. On this site that is the one unacceptable failure.
 *
 * So the browser re-checks two things on every visit, and either one withholds
 * the figure:
 *
 *   1. **The act's end date**, when it has one. Past it, the act has lapsed.
 *   2. **The build's own age.** An act that names no end date runs until
 *      replaced, so nothing about it ever expires and check 1 can never fire.
 *      A build older than the limit therefore cannot vouch for its figure at
 *      all: the successor might have been in force for days.
 *
 * Check 2 is what covers open-ended acts, which are the more dangerous case —
 * a lapsed bounded act at least fails loudly on a date.
 *
 * Both explanations are rendered by the server and merely unhidden here. No
 * sentence is assembled in JavaScript.
 *
 * This never turns anything back on. It can only take the figure away.
 */

import { isBuildStale, isPastExpiry } from '../lib/date.ts';

/** Which of the two checks fired. Chooses the note the visitor reads. */
type Reason = 'expired' | 'build_age';

function goQuiet(root: HTMLElement, reason: Reason): void {
  // The headline figure and its hallmark: replaced by the server-rendered
  // "no figure" block sitting hidden next to them.
  for (const shown of root.querySelectorAll<HTMLElement>('[data-when-fresh]')) shown.hidden = true;
  for (const hidden of root.querySelectorAll<HTMLElement>('[data-when-stale]')) hidden.hidden = false;

  // Both notes are server-rendered and hidden; reveal the one that applies.
  for (const note of root.querySelectorAll<HTMLElement>('[data-stale-note]')) {
    note.hidden = note.dataset['staleNote'] !== reason;
  }

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
  /*
   * `data-stale-guard` marks the card as guarded and carries no value. It used
   * to carry the expiry, which coupled the two: an act naming no end date had
   * no attribute, so there was no root to find and the guard never ran at all —
   * on exactly the records that need the age check most. The marker and the
   * dates are separate for that reason.
   */
  const root = document.querySelector<HTMLElement>('[data-stale-guard]');
  if (root === null) return;

  const now = new Date();

  // 1. The act's own end date, when it has one.
  const expiry = root.dataset['staleExpiry'] ?? '';
  if (expiry !== '' && isPastExpiry(expiry, now)) {
    goQuiet(root, 'expired');
    return;
  }

  // 2. The age of the build. Applies whether or not the act names an end date,
  //    and is the only check that can catch an open-ended one.
  const built = root.dataset['buildDate'] ?? '';
  const limit = Number(root.dataset['buildMaxAgeDays']);
  if (built !== '' && isBuildStale(built, now, limit)) {
    goQuiet(root, 'build_age');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
