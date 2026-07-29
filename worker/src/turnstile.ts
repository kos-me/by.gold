/**
 * Turnstile verification.
 *
 * HANDOFF asked for no captcha — "a captcha breaks the page's tone". The
 * objection is taken and reflected in the mode: Turnstile in Managed mode
 * usually asks the visitor nothing and renders as a thin strip rather than
 * "select all the traffic lights". The requirement to verify comes from the
 * overnight brief, which takes precedence.
 *
 * To drop it entirely: remove the `verifyTurnstile` call from `contact.ts`
 * and the widget from `ReportForm.astro`. The honeypot and the rate limit
 * stay and keep working.
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileResult {
  readonly ok: boolean;
  /** Cloudflare error codes — for the log only, never shown to a visitor. */
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
    // Cloudflare is unreachable. Fail closed: letting it through unverified is not an option.
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
