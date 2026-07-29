/**
 * The worker's environment.
 *
 * Every secret arrives from here and nowhere else. Not a single default that
 * would let something "work" without a real key: a substituted dummy key is
 * worse than a broken form, because it looks like a working one.
 *
 * What goes where is documented in DEPLOY.md.
 */

export interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Env {
  /** The site's static assets. Served for anything not under /api/. */
  readonly ASSETS?: { fetch(request: Request): Promise<Response> };

  /** Per-decree report counters and the publish-block flag. */
  readonly REPORTS?: KVLike;
  /** Rate-limit counters keyed by hashed address. */
  readonly RATE_LIMIT?: KVLike;

  readonly TURNSTILE_SECRET_KEY?: string;
  readonly RESEND_API_KEY?: string;
  /** Where error reports arrive. */
  readonly REPORT_TO_EMAIL?: string;
  /** Sender. The domain must be verified in Resend. */
  readonly REPORT_FROM_EMAIL?: string;
  /** Salt for hashing the address before it goes into KV. */
  readonly RATE_LIMIT_SALT?: string;

  /** GitHub — for the pull request carrying a new decree. */
  readonly GITHUB_TOKEN?: string;
  readonly GITHUB_REPO?: string;

  /** `production` makes Turnstile verification mandatory. */
  readonly ENVIRONMENT?: string;
}

export function isProduction(env: Env): boolean {
  return env.ENVIRONMENT === 'production';
}

/**
 * A mandatory secret. Its absence is a configuration error, not a reason to
 * quietly carry on with an empty value.
 */
export function requireSecret(env: Env, key: keyof Env): string {
  const value = env[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(
      `Secret ${String(key)} is not set. See DEPLOY.md. Substituting a ` +
        'placeholder here is not allowed: the form must visibly not work ' +
        'rather than pretend that it does.',
    );
  }
  return value;
}
