/**
 * Карта сайта. Три страницы — генератор ради трёх адресов не нужен.
 *
 * `lastmod` берётся из данных, а не из времени сборки: пересборка без
 * изменения цифр — не изменение страницы, и говорить поисковику обратное
 * значит приучать его не верить.
 */

import type { APIRoute } from 'astro';

import { tariffs } from '../lib/data.ts';
import { NAV } from '../lib/site.ts';

/** Самый свежий перенос данных — он и есть дата последнего изменения. */
function lastModified(): string | null {
  const stamps = tariffs
    .map((record) => record.transcribed_at)
    .filter((stamp): stamp is string => typeof stamp === 'string')
    .sort();
  return stamps.at(-1) ?? null;
}

export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL('https://gold.by')).origin;
  const lastmod = lastModified();

  const urls = NAV.map((item) => {
    // Главная — с косой чертой (`https://gold.by/`), она же в canonical.
    // Остальные — без, как отдаёт Cloudflare при `trailingSlash: 'never'`.
    const loc = item.href === '/' ? `${origin}/` : `${origin}${item.href}`;
    return [
      '  <url>',
      `    <loc>${loc}</loc>`,
      // Главная меняется вместе с постановлением, остальные — почти никогда.
      item.href === '/' && lastmod !== null ? `    <lastmod>${lastmod}</lastmod>` : null,
      `    <changefreq>${item.href === '/' ? 'weekly' : 'yearly'}</changefreq>`,
      `    <priority>${item.href === '/' ? '1.0' : '0.6'}</priority>`,
      '  </url>',
    ]
      .filter((line) => line !== null)
      .join('\n');
  }).join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  return new Response(body, {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
};
