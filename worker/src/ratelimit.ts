/**
 * Ограничение частоты запросов.
 *
 * В KV попадает только хеш адреса с солью и счётчик, на час. Ни самого
 * адреса, ни чего-либо из письма. По истечении TTL запись исчезает сама —
 * чистить нечего.
 */

import type { KVLike } from './env.ts';

/** Сколько сообщений с одного адреса за окно. */
export const LIMIT_PER_WINDOW = 5;

/** Длина окна в секундах. */
export const WINDOW_SECONDS = 3600;

/**
 * SHA-256 от «соль + адрес», первые 32 hex-символа.
 *
 * Соль обязательна: без неё пространство IPv4 перебирается за секунды,
 * и «хеш» перестаёт что-либо скрывать.
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
 * Считает обращение и говорит, пропускать ли его.
 *
 * Окно фиксированное, не скользящее: на форме сообщений об ошибке это
 * достаточная точность, а KV-операций втрое меньше.
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
