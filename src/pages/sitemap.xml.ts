/**
 * The sitemap. Three pages — no generator package is warranted for three URLs.
 *
 * `lastmod` comes from the data, not the build time: a rebuild that changes no
 * figures is not a change to the page, and telling a search engine otherwise
 * teaches it not to believe us.
 */

import type { APIRoute } from 'astro';

import { tariffs } from '../lib/data.ts';
import { NAV } from '../lib/site.ts';

/** The most recent transcription — that is the real last-modified date. */
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
    // The homepage with a trailing slash (`https://gold.by/`), matching canonical.
    // The rest without, as Cloudflare serves them under `trailingSlash: 'never'`.
    const loc = item.href === '/' ? `${origin}/` : `${origin}${item.href}`;
    return [
      '  <url>',
      `    <loc>${loc}</loc>`,
      // The homepage changes with each decree; the others almost never do.
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
