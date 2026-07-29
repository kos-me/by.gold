/**
 * Воркер gold.by.
 *
 * Делает две вещи:
 *   1. `/api/*` — форма сообщения об ошибке и служебный статус.
 *   2. cron — проверка источников (шаг 9). Ничего не публикует сам:
 *      только открывает PR или заводит issue.
 *
 * Всё остальное отдаёт статика сайта.
 */

import { handleContact } from './contact.ts';
import { runScheduled } from './scheduled.ts';
import type { Env } from './env.ts';

function notFound(): Response {
  return new Response(JSON.stringify({ status: 'not_found' }), {
    status: 404,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/** Отметка о последней проверке — её читает страница, чтобы не врать в подвале. */
async function handleStatus(env: Env): Promise<Response> {
  const raw = (await env.REPORTS?.get('status:last_check')) ?? null;
  return new Response(raw ?? JSON.stringify({ last_checked: null, last_checked_source: null }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/contact') {
      return handleContact(request, env);
    }

    if (url.pathname === '/api/status' && request.method === 'GET') {
      return handleStatus(env);
    }

    if (url.pathname.startsWith('/api/')) return notFound();

    if (env.ASSETS === undefined) return notFound();
    return env.ASSETS.fetch(request);
  },

  async scheduled(event: { cron: string }, env: Env): Promise<void> {
    await runScheduled(event, env);
  },
};
