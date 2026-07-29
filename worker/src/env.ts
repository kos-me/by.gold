/**
 * Окружение воркера.
 *
 * Все секреты приходят отсюда и только отсюда. Ни одного значения по
 * умолчанию, которое позволило бы чему-то «заработать» без настоящего
 * ключа: подставленный фиктивный ключ хуже неработающей формы, потому что
 * выглядит как работающая.
 *
 * Что куда класть — в DEPLOY.md.
 */

export interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Env {
  /** Статика сайта. Отдаётся всем, что не начинается с /api/. */
  readonly ASSETS?: { fetch(request: Request): Promise<Response> };

  /** Счётчики обращений по актам и флаг блокировки публикации. */
  readonly REPORTS?: KVLike;
  /** Счётчики частоты запросов по хешу адреса. */
  readonly RATE_LIMIT?: KVLike;

  readonly TURNSTILE_SECRET_KEY?: string;
  readonly RESEND_API_KEY?: string;
  /** Куда приходят сообщения об ошибках. */
  readonly REPORT_TO_EMAIL?: string;
  /** От кого. Домен должен быть подтверждён в Resend. */
  readonly REPORT_FROM_EMAIL?: string;
  /** Соль для хеширования адреса перед записью в KV. */
  readonly RATE_LIMIT_SALT?: string;

  /** GitHub — для PR с новым постановлением (шаг 9). */
  readonly GITHUB_TOKEN?: string;
  readonly GITHUB_REPO?: string;

  /** `production` включает обязательную проверку Turnstile. */
  readonly ENVIRONMENT?: string;
}

export function isProduction(env: Env): boolean {
  return env.ENVIRONMENT === 'production';
}

/**
 * Обязательный секрет. Отсутствие — ошибка конфигурации, а не повод
 * тихо продолжить с пустым значением.
 */
export function requireSecret(env: Env, key: keyof Env): string {
  const value = env[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(
      `Не задан секрет ${String(key)}. См. DEPLOY.md. Подставлять сюда ` +
        'значение-заглушку нельзя: форма должна честно не работать, а не ' +
        'делать вид, что работает.',
    );
  }
  return value;
}
