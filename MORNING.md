# Morning report

The overnight build of gold.by. All ten steps were completed.
`data/tariffs.json` was left empty as instructed — **not one price, act number
or date entered the repository.**

Everything is green: 216 tests, `astro check` clean, the build builds.

> Open questions and decisions now live in **`QUESTIONS.md`**, which you can
> annotate directly; `node scripts/answers.mjs` reports what is answered and
> what is not. This file is the narrative version.

---

## 1. What was done, by step

| step | state | in short |
|---|---|---|
| 1. Astro + TS strict scaffold | ✅ | Astro 7.1.5, strict with every strictness flag, Vitest |
| 2. Schema and validation | ✅ | rejects a record with no number, effective date or source link; `stated_expiry` nullable |
| 3. `tariff.ts` — state | ✅ | pure function, clock injected, 34 tests |
| 4. `calc.ts` — arithmetic | ✅ | integer kopecks, 38 tests, every fineness covered |
| 5. Homepage in the "no figure" state | ✅ | built first, checked by eye at 360/768/1200 |
| 6. Homepage in the working state | ✅ | on a fixture from `tests/`, plus an "expired" fixture |
| 7. `/kak-proverit-otsenku`, `/o-proekte` | ✅ | with all six form states |
| 8. Form → worker → Resend | ✅ | Turnstile, honeypot, rate limit in KV, 34 tests |
| 9. Scheduled source check | ⚠️ | Minfin done in full; **NBRB not done** |
| 10. SEO layer | ✅ | sitemap, robots, canonical, Russian meta, GA4 behind consent |

One commit per step, working tree clean. The decision log is
`IMPLEMENTATION-LOG.md`, which is more detailed than this file.

---

## 2. Two departures from the mockup you need before anything else

### 2.1. Nine finenesses, not six, and a different set

Minfin's live page turned out to be reachable, so the structure came from it.

- The mockup: 375, 500, 585, 750, 958, 999.
- The act: **375, 500, 583, 585, 750, 900, 916, 950, 958**.

Three consequences:

1. **583 was absent from the mockup entirely.** It is the Soviet standard, and
   for an inherited chain or a ring from the eighties it is very likely the
   most common fineness there is. The hole sat exactly where the site matters
   most. In the table 583 and 585 **share one cell and one price** — the parser
   handles that, and there is a test for it.
2. **900, 916 and 950** were missing too.
3. **999 does not appear in the scrap table.** Pure gold has its own line
   ("per gram of metal in fineness") and appears under bullion bars. Showing
   999 among scrap finenesses would promise a price the act does not state.

`FINENESSES` now matches the source. At 360px the nine buttons wrap onto two
rows and the table does not scroll sideways — verified.

### 2.2. The source page carries neither the effective date nor the expiry

It has only "ПРИЛОЖЕНИЕ к постановлению … DD.MM.YYYY № N" and the tables. Both
dates live in the text of the act itself.

That redefined step 9 entirely. The parser physically cannot assemble a
complete record, so:

> **The pull request the worker opens is deliberately red.** The draft carries
> `effective_from: null` and `stated_expiry: null`, the schema rejects it, and
> the check fails. Merging it without opening the act and filling in both dates
> by hand is impossible.

The red check is not an annoyance; it is the gate. The PR body says so in
plain words, with the procedure and the reminder: **if the act names no end
date, leave `null` — do not invent one.**

---

## 3. What is blocked, and what I need from you

*(Each of these is an item in `QUESTIONS.md` with a space for your answer.)*

**B1. Fill in `data/tariffs.json`.** Only you can transcribe from the act. The
site currently shows the "no verified figure yet" state, which works and looks
as intended, but is not what the site is for. `npm run build` will not let you
get the structure wrong. If you want me to transcribe, I need an explicit yes,
and I will still leave `transcribed_by` as you.

**B2. Check the counter-procedure text.** `/kak-proverit-otsenku` describes
assay in your presence, certified scales, returned parts and reweighing, an
agreed correction, precision of 0.01 g for gold and 0.1 g for silver, and
documentation. The brief said to verify this against the published
instruction. **There was nothing to verify against** — I did not have the
instruction, and a second-hand summary is not a source on this site of all
sites. **This is the only place where claims are not backed by a primary
source.** The warning is at the top of `src/lib/procedure.ts`.

**B3. NBRB — not done.** `bullion.json` is empty and there is no fetcher.
`www.nbrb.by` is unreachable from this machine (the connection drops; only
`api.nbrb.by/exrates` answers, and that is currency rates). I found no
documented bullion endpoint, and writing a parser for a page I have never seen
would be fiction, not parsing. The section survives: it shows an explanation
and a link, with no figures. Note that **bullion buyback prices are on the same
Minfin page**, in their own table, with the surcharge — a verified source and
cheaper to add. But that is a scrap-buyer's price for a bar, not a National
Bank quote; the two must not be conflated, and the call is yours.

**B4. Keys and accounts.** Nothing is deployed. Everything reads from the
environment and **no key is in the repository or substituted**. Full list and
order of operations in `DEPLOY.md`.

**B5. Photo licences.** HANDOFF notes three frames were taken from the internet
with rights unverified, the scales shot especially. I did not touch them.

**B6–B8.** The `pravka@gold.by` mailbox; a verified URL for Пробирная
инспекция (I left the entry link-less rather than guess); and whether `gold.by`
is yours and on Cloudflare.

---

## 4. Decisions I made for you

The full list is in `QUESTIONS.md` (D1–D16), each with what happens if you say
nothing. The ones most worth your attention:

**D1. I rewrote the jewellery-chain claim.** The mockup asserted that chains
sometimes pay above the price "under their own buyback programmes". That says
someone pays more than someone else for ordinary cash buyback, which cannot be
true when the tariff is uniform — and your own HANDOFF flags the sentence as
unsupported. Now: above-tariff happens only as a trade-in credit against a new
purchase, which is a different transaction.

**D2. I dropped the "we check every hour" promise** until there is a real
check log to back it, and the footer shows the source link instead of a build
time — a build is not a check.

**D4. Turnstile, though HANDOFF asked for no captcha.** Managed mode, which
usually asks nothing. Removing it entirely is a five-minute job.

**D5. A per-decree counter in KV, though the brief said "store nothing".**
Without it the mockup's "already under review" state cannot exist. Only numbers
are stored; a test snapshots the store and asserts no email, text or IP is there.

**D14. The worker's PR is deliberately red** — see 2.2 above.

Also: consent in a cookie rather than localStorage; no Product/Offer structured
data; a 100,000 g input cap (my number); mass not rounded to weighing
precision; a bespoke font subset at 94.8 KB instead of 333 KB.

---

## 5. What I think is wrong in the source material

1. **"Jewellery chains sometimes pay more"** — rewritten, see D1. Your own
   HANDOFF flags it.
2. **The mockup's fineness set** — incomplete, and it contains 999, which is
   not in the scrap table. Corrected against the source.
3. **"We check every hour"** — a promise with nobody to keep it until the
   worker is deployed. Made conditional.
4. **The form contract.** HANDOFF says `POST /api/report`; the overnight brief
   says `/api/contact`. I used `/api/contact` and kept HANDOFF's response
   shapes. If anything else expects `/api/report`, they need reconciling.
5. **Cadence.** The brief says daily, the mockup promises hourly. I set Minfin
   to hourly and bullion to daily.
6. **`data/status.json`** — my addition. Without it the footer cannot honestly
   say when the source was last looked at.

---

## 6. Commands

```sh
npm ci
npm run dev            # real data → the "no figure yet" state
npm run dev:valid      # working state, fixture
npm run dev:expired    # expired, no successor
npm run check          # types + 216 tests + build
npm test
```

Visual and overflow check (needs Chrome installed):

```sh
npm run build && npx serve dist -l 4399 &
node scripts/shoot.mjs http://localhost:4399 shots / /kak-proverit-otsenku /o-proekte
```

Browser smoke test of the calculator and the form:

```sh
npm run build:valid && npx serve dist-valid -l 4401 &
node scripts/smoke.mjs http://localhost:4401/ http://localhost:4399/ http://localhost:4399/o-proekte
```

Refresh the fonts: `node scripts/fetch-fonts.mjs`.

> Node is installed on this machine through `mise` with no global version, so
> `node` was not on `PATH`. I did not touch your global config — I put a
> `mise.toml` in the project. If `node` is not found, run `mise install` at the
> repository root.

---

## 7. Honest confidence

### Solid

- **Tariff state logic.** Pure function, clock injected, 34 tests on the
  boundaries: last day of the period, null expiry, a gap between acts, an
  open-ended act being superseded, midnight in Minsk from both sides.
- **Calculator arithmetic.** Integer kopecks, 38 tests, every fineness, plus a
  cross-check in a real browser: the sum from the script agrees with the price
  the server rendered into the table.
- **The data/fixture boundary.** A test guards both directions and catches both
  "a fixture reached `data/`" and "a fixture became plausible".
- **The "no figure" state.** Built first, on empty data, checked by eye in all
  three variants at three widths.
- **Report intake.** 34 tests with the network and KV faked, including a store
  snapshot checking for leaked email or message text.

### Decent, but no human has looked at it

- **The Minfin parser.** Structure from the real page, 51 tests, six fixtures.
  I later ran it over a real copy of the live page: act number, act date and
  all nine finenesses came out correctly, with no warnings, and the shared
  583/585 cell resolved properly. The "my fixtures might encode my own
  misreading" worry is resolved. Still read the worker's first real PR with
  care — the GitHub side has never run against real GitHub.
- **The GitHub flow.** Logic covered against a fake API. Never exercised
  against real GitHub — there is no token.
- **Layout on real devices.** Checked in headless Chrome at 360/768/1200. No
  actual Android in hand.

### Rough

- **The counter-procedure text** — see B2. The one unverified place on the site.
- **NBRB** — not done at all.
- **The form end to end** — Turnstile, Resend and the rate limit together, on
  live keys, has never been run. Each piece is tested in isolation.
- **The sparkline** on three points looks crude. It works, but on real data you
  may want a different floor.
- **Tone of the Russian copy.** I wrote it; no native speaker has read it.

### What I did not do

I invented no prices, act numbers or dates anywhere: not in the data, not in
the tests, not in comments, not in examples. I did not copy the figures from
the brief into `data/`. I did not search for current prices. I scraped no
buyer. I deployed nothing and substituted no key.
