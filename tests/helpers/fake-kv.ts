/**
 * KV в памяти для тестов. TTL хранится, но сам по себе не истекает —
 * тесты, которым нужно истечение, сдвигают время вызовом `expire`.
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

  /** Сдвигает часы хранилища на N секунд — чтобы TTL действительно истекал. */
  expire(seconds: number): void {
    this.clock += seconds;
  }

  /** Всё содержимое — чтобы тест мог убедиться, что лишнего не записано. */
  snapshot(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, entry] of this.store) out[key] = entry.value;
    return out;
  }

  get size(): number {
    return this.store.size;
  }
}
