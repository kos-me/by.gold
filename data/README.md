# data/

The single source of every figure on the site. Everything the pages display
comes from here. There are no prices anywhere in the code.

## Rules

1. **Invent nothing.** Every record is transcribed by hand from the act itself
   (or from the official page), never from news coverage and never from memory.
2. **An empty array is a working state**, not an error. The site knows how to
   render without a figure: calculator off, an explanation, a link to the source.
3. Test records live in `tests/fixtures/` and must never be placed here.
   `npm test` enforces that with a dedicated check.

## `tariffs.json`

An array of records of Minfin decrees on buyback prices for precious metals
from individuals. Order in the file does not matter — the code sorts for itself.

```jsonc
{
  "act_number": "31",                  // required, as printed in the act, without «№»
  "act_date": "2026-07-08",            // date of adoption, ISO, required
  "effective_from": "2026-07-18",      // date it takes force, ISO, required
  "stated_expiry": "2026-07-31",       // date through which it applies — OR null
                                       // if the act names no end date. Do not invent one.
  "source_url": "https://minfin.gov.by/...",  // required
  "transcribed_at": "2026-07-18T09:00:00Z",   // when a person transcribed the figures
  "transcribed_by": "name or handle",         // who transcribed them
  "prices_byn_per_gram": {             // BYN per gram of alloy mass
    "375": 0, "500": 0, "583": 0, "585": 0, "750": 0,
    "900": 0, "916": 0, "950": 0, "958": 0
  },
  "notes": "optional comment"
}
```

`stated_expiry` is **nullable**: some acts name no end date. In that case use
`null`, and the record stands until the next one replaces it.

Nine finenesses, taken from the source page rather than the mockup. Note that
**583 is a real fineness** (the Soviet standard, and very common on inherited
jewellery) and that **999 does not appear** in the scrap table — it belongs to
pure metal and bullion bars.

## `bullion.json`

National Bank buyback prices for bullion bars. A different regime, a different
source; it never enters the scrap calculator. Format: see `src/lib/schema.ts`.

## `status.json`

A record of the last real check of the source. Written by the worker, never by
hand. `null` means no check has happened, and the site then promises nothing.
