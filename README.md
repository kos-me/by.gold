# gold.by

A page that tells someone what their old gold is officially worth in Belarus,
and what should happen when they take it to a buyback counter.

The buyback price is set by the Ministry of Finance; every licensed buyer pays
the same. So this is not a price-comparison site — it is a "here is the
official figure, and here is what backs it" site.

The site is in Russian. Documentation and code comments are in English.

## The rule that matters

**The calculator goes quiet rather than lying.**

The price lives only in `data/tariffs.json`, alongside the decree number, the
date and a link to the source. A record missing any of those three never
reaches the site. When an act's stated period has ended and no successor has
been transcribed, the figure is withheld, the calculator switches off, and the
last known figure is shown as an archive. That is an ordinary state of the
site, not a fault, and it was built first.

No figure ever appears automatically. The cron worker can only open a pull
request; for that PR to go green a person must open the act and fill in the
dates the source page does not carry.

## Running it

```sh
npm ci
npm run dev            # http://localhost:4321 — on the real data
```

`data/tariffs.json` holds real acts, so the default view is the working state.
To see the others:

```sh
npm run dev:valid      # the working state, on a fixture from tests/
npm run dev:expired    # expired, no successor
```

Builds on fixtures carry a yellow-and-black banner across the top. They cannot
be mistaken for the real site, and that is deliberate.

## Checks

```sh
npm run check          # types + tests + build
npm test               # 245 tests
npm run typecheck
```

Visual check and horizontal-overflow check (needs Chrome installed):

```sh
npm run build && npx serve dist -l 4399
node scripts/shoot.mjs http://localhost:4399 shots / /kak-proverit-otsenku /o-proekte
npm run build:expired && npx serve dist-expired -l 4402 &
node scripts/smoke.mjs http://localhost:4401/ http://localhost:4402/ http://localhost:4399/o-proekte
```

What a build shows on a later date — the staleness guard, in a real browser with
the clock faked:

```sh
node scripts/clock.mjs http://localhost:4399/ 2026-07-31 2026-08-01
```

## Layout

```
data/            the only source of figures. An empty array is a working state
src/lib/         schema, tariff (state), calc (arithmetic), copy (page text)
src/pages/       three pages, sitemap, robots
src/components/  homepage blocks and the report form
worker/          /api/contact and the scheduled source check
tests/           245 tests; fixtures live here and only here
handoff/         design source material
scripts/         fonts, page screenshots, browser smoke test
```

**When a new decree appears, read `UPDATING.md`.** It explains in plain words
what happens when the data changes, how to add an act, and why the site must
rebuild on a schedule and not only on a push.

Open questions and decisions: `QUESTIONS.md` (answer in it directly, then run
`node scripts/answers.mjs`).
Decision log: `IMPLEMENTATION-LOG.md`. Deployment and secrets: `DEPLOY.md`.

## What is not here, and must not be

- Prices, act numbers or dates anywhere but `data/` and the fixtures in `tests/`.
- Forecasts, "best price", "sell now while it's high".
- Any claim that one buyer pays more than another for cash buyback.
- Any suggestion that something can be bought or sold through this site.
- Scraping of buyers or jewellery chains: government sources only.
- `localStorage` and `sessionStorage`.
- Any analytics other than GA4.
