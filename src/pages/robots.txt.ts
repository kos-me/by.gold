/**
 * robots.txt.
 *
 * Закрыт только `/api/` — там нечего индексировать. Всё остальное открыто:
 * сайт существует затем, чтобы его нашли.
 */

import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL('https://gold.by')).origin;

  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
};
