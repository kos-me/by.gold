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

## Archive records

`transcribed_from` is optional and defaults to `"act"` — the figures were read
from the act itself. The other value, `"archive"`, marks a record taken from one
of the Ministry's year-archive pages
(`…/activities_jewels/fund/pokupka/fizlic/archive/<year>/`).

Those pages carry the act's number and date, the date it took force, and all
four price tables — but **not the act's text**. So whether the act named an end
date cannot be known from them. An archive record therefore must have
`stated_expiry: null`, and there `null` means **"not read"**, not "the act names
no end date". The schema rejects an archive record that states an expiry: a date
there could only have come from somewhere unrecorded.

Two different meanings for one `null` would normally be a trap. It is kept
harmless by making it unable to matter:

- **An archive record can never be the act in force.** `resolveTariffState`
  excludes it from `current`, `lastKnown` and `upcoming`. It appears only in
  `history`.
- So no figure the site presents as current, and no figure it keeps as the last
  known one, ever rests on an expiry nobody read.

A consequence worth stating plainly: importing history **cannot** change the
price on the homepage. If it appears to, something is wrong.

The history table prints only the start date for these records — "с 6 ноября
2025". Deriving an end date from the next act's start would assume the two are
contiguous, which is not known either.

If you later read the act itself for one of these, replace the record: drop
`transcribed_from`, fill in the real `stated_expiry`, and point `source_url` at
the act. A record read from the act always wins over one read from the archive.

### Act numbers are not unique

They restart each year. There is a № 31 of 03.06.2024 and a № 31 of 08.07.2026.
Identify an act by date **and** number, never by number alone.

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
