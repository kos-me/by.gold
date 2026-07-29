/**
 * An in-memory KV for tests. TTLs are stored but never expire on their own —
 * a test that needs expiry advances the clock with `expire`.
 */

import type { KVLike } from '../../worker/src/env.ts';

interface Entry {
  value: string;
  expiresAt: number | null;
}

export class FakeKV implements KVLike {
  private readonly store = new Map<string, Entry>();
  private clock = 0;

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (entry === undefined) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= this.clock) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    const ttl = options?.expirationTtl;
    this.store.set(key, {
      value,
      expiresAt: ttl === undefined ? null : this.clock + ttl,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  /** Advances the store's clock by N seconds so TTLs really do expire. */
  expire(seconds: number): void {
    this.clock += seconds;
  }

  /** The full contents, so a test can assert nothing extra was written. */
  snapshot(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, entry] of this.store) out[key] = entry.value;
    return out;
  }

  get size(): number {
    return this.store.size;
  }
}
