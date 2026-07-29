/**
 * Request rate limiting.
 *
 * Only a salted hash of the address and a counter reach KV, for an hour.
 * Neither the address itself nor anything from the message. When the TTL
 * expires the entry disappears on its own — there is nothing to clean up.
 */

import type { KVLike } from './env.ts';

/** How many reports one address may send per window. */
export const LIMIT_PER_WINDOW = 5;

/** Window length in seconds. */
export const WINDOW_SECONDS = 3600;

/**
 * SHA-256 of "salt + address", first 32 hex characters.
 *
 * The salt is mandatory: without it the IPv4 space is exhaustible in seconds
 * and the "hash" stops concealing anything.
 */
export async function hashClient(ip: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

export interface RateLimitVerdict {
  readonly allowed: boolean;
  readonly used: number;
  readonly limit: number;
}

/**
 * Counts a request and says whether to allow it.
 *
 * A fixed window rather than a sliding one: for an error-report form that is
 * accurate enough, and it costs a third of the KV operations.
 */
export async function consume(
  kv: KVLike,
  clientHash: string,
  options: { limit?: number; windowSeconds?: number } = {},
): Promise<RateLimitVerdict> {
  const limit = options.limit ?? LIMIT_PER_WINDOW;
  const windowSeconds = options.windowSeconds ?? WINDOW_SECONDS;
  const key = `rl:${clientHash}`;

  const raw = await kv.get(key);
  const used = raw === null ? 0 : Number.parseInt(raw, 10);
  const current = Number.isFinite(used) && used > 0 ? used : 0;

  if (current >= limit) {
    return { allowed: false, used: current, limit };
  }

  await kv.put(key, String(current + 1), { expirationTtl: windowSeconds });
  return { allowed: true, used: current + 1, limit };
}
