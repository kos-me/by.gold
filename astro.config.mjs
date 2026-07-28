// @ts-check
import { defineConfig } from 'astro/config';

const SITE = process.env.SITE_URL ?? 'https://gold.by';

// https://astro.build/config
export default defineConfig({
  site: SITE,
  output: 'static',
  trailingSlash: 'never',
  build: {
    // Emit /kak-proverit-otsenku.html rather than /kak-proverit-otsenku/index.html
    // so Cloudflare Pages serves the extensionless URL directly.
    format: 'file',
    inlineStylesheets: 'always',
  },
  compressHTML: true,
  devToolbar: { enabled: false },
});
