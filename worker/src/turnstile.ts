/**
 * Проверка Turnstile.
 *
 * В HANDOFF просили обойтись без капчи — «капча ломает тон страницы».
 * Возражение принято и учтено в выборе режима: Turnstile в managed-режиме
 * обычно ничего не спрашивает у человека и выглядит как тонкая полоска,
 * а не как «выберите светофоры». Само требование проверки — из ночного
 * задания, оно приоритетнее.
 *
 * Если решите отказаться совсем: убрать вызов `verifyTurnstile` из
 * `contact.ts` и виджет из `ReportForm.astro`. Honeypot и лимит частоты
 * останутся и продолжат работать.
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileResult {
  readonly ok: boolean;
  /** Коды ошибок Cloudflare — только в лог, посетителю их не показываем. */
  readonly errorCodes: readonly string[];
}

export async function verifyTurnstile(
  token: string,
  secret: string,
  remoteIp: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<TurnstileResult> {
  if (token.trim() === '') return { ok: false, errorCodes: ['missing-input-response'] };

  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (remoteIp !== null) body.append('remoteip', remoteIp);

  let response: Response;
  try {
    response = await fetchImpl(VERIFY_URL, { method: 'POST', body });
  } catch {
    // Cloudflare недоступен. Закрываемся: пропустить непроверенным нельзя.
    return { ok: false, errorCodes: ['verify-unreachable'] };
  }

  if (!response.ok) return { ok: false, errorCodes: [`http-${response.status}`] };

  const payload = (await response.json().catch(() => null)) as {
    success?: boolean;
    'error-codes'?: string[];
  } | null;

  if (payload === null) return { ok: false, errorCodes: ['bad-json'] };
  return {
    ok: payload.success === true,
    errorCodes: payload['error-codes'] ?? [],
  };
}
