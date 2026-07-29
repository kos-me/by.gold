# Build log

An overnight autonomous build. One section per step from the brief. Decisions
taken without the chance to ask are marked **Decision**; objections are marked
**Objection**.

---

## Step 1 — Astro + TypeScript strict scaffold

**Done**

- `mise.toml` and `.node-version` pin Node 24.15.0.
- Astro 7.1.5, `minimal` template, `output: 'static'`.
- `tsconfig.json` — `astro/tsconfigs/strict` plus `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noUnusedLocals/Parameters`,
  `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`.
- Vitest 4 as the runner (`tests/**/*.test.ts`).
- `data/tariffs.json` and `data/bullion.json` created as **empty arrays**, as
  the brief demanded. Not one figure is in the repository.
- `npm run build` and `npm run typecheck` green.

**Environment.** Node is installed on this machine but through `mise` with no
global version, so `node` was not on `PATH`. I left the user's global config
alone: instead of `mise use -g`, a `mise.toml` in the project. That also fixes
startup for CI.

**Decision — `build.format: 'file'`.** Astro otherwise emits
`kak-proverit-otsenku/index.html`; with `trailingSlash: 'never'` that means a
redirect on every navigation. `'file'` emits `kak-proverit-otsenku.html`, which
Cloudflare Pages serves at the extension-less URL directly.

**Decision — `inlineStylesheets: 'always'`.** The budget is 150 KB excluding
fonts and there is not much CSS; a separate request costs more than inlining.

**Decision — `handoff/` stays in the repository** as design source material but
is excluded from `tsconfig` (otherwise `astro check` complains about the
mockup's `support.js`, which is preview runtime, not our code).

---

## Step 2 — the data schema and its validation

**Done**

- `src/lib/schema.ts` — types and validators with no dependencies (imported by
  both the site and the worker). I did not add Zod: hand-rolled validation
  gives precise messages and does not pull a package in for one file.
- `src/lib/date.ts` — ISO dates as strings, "today" in Minsk, formatting.
- `src/lib/data.ts` — reads `data/` at build time; invalid data kills the build
  with a list of issues.
- `tests/schema.test.ts`, `tests/date.test.ts`, `tests/data-integrity.test.ts`
  — 56 tests, green.
- `npm run build` now starts with `validate:data`.

**Mandatory fields.** `act_number`, `effective_from`, `source_url` — a record
missing any of them is rejected, as required. Beyond those I also made
`act_date`, `transcribed_at` and `transcribed_by` mandatory: without "who
transcribed it and when" there is nobody to ask about the figure.

**`stated_expiry`.** The field must be *present*, but `null` is a legal value.
An absent field is not the same as `null`: that is the difference between "the
act named no end date" and "somebody forgot to look". The first is data; the
second is an oversight.

**Decision — a closed list of source hosts.** `source_url` is accepted only
from `minfin.gov.by`, `pravo.by`, `etalonline.by`, `nbrb.by` (and `www.`). Not
a warning but a refusal: adding a host is one line and a deliberate act,
whereas quietly accepting a link to a news story is not acceptable. For bullion
the list is narrower still — `nbrb.by` only.

**Decision — a partial fineness set is allowed.** The schema does not demand
all nine: whichever the act names is what exists. The "all expected finenesses
present" check belongs to the parser in step 9 and flags a discrepancy as
"needs review" rather than "invalid", exactly as the brief asks.

**Decision — prices strictly > 0.** A zero in the price table is not "free" but
a transcription failure. Such a record does not pass.

**Decision — `data-integrity.test.ts` guards both sides of the boundary.**
`data/` must carry no fixture markers (`TEST-`, `example.by`, "stub"); fixtures
must have prices below 10 BYN/g and dates in 2000, so a fixture can never be
mistaken for a real record. Plus a grep over `src/`: not one number next to
`BYN` in any source file.

---

## Step 3 — tariff state

**Done**

- `src/lib/tariff.ts`, the function `resolveTariffState(records, now)`. Pure:
  the clock is an argument, there is no `new Date()` inside. Otherwise
  behaviour at the expiry boundary can only be checked by waiting for midnight.
- `tests/tariff.test.ts` — 34 tests.

**How the status is decided**

1. Records are sorted by effective date.
2. The last one with `effective_from <= today` is taken — it supersedes every
   earlier one, **including open-ended ones**.
3. No such record → `unavailable` (`no_records` or `not_yet_effective`).
4. `stated_expiry === null` → `valid`, held until replaced.
5. `today <= stated_expiry` → `valid`.
6. Otherwise → `review_required`: figure withheld, archive kept.

**Decision — "in force through 31.07" includes 31 July.** Comparison is `<=`.
Otherwise the site would fall silent for a day while the act was still live.

**Decision — a `not_yet_effective` state.** An act published but not yet in
force is its own reason, and the page can say honestly "the new decree exists
and takes force on such a date" instead of a generic "there is no figure".
`TariffState` carries an `upcoming` field for it.

**Decision — an open-ended act does not revive.** If an act with no end date
was replaced by one with an end date and that one expired, the state is
`review_required`, not a fallback to the old open-ended act. Falling back would
mean showing a figure that has already been superseded.

**Decision — the day boundary is Minsk.** Belarus is UTC+3 with no clock
changes, so arithmetic suffices — no `Intl`, no tzdata. Tests pin 23:30 and
00:30 either side of midnight.

---

## Step 4 — calculator arithmetic

**Done**

- `src/lib/calc.ts` — `parseMass`, `totalKopecks`, `calculate`, formatting.
  Dependency-free: the module ships to the browser.
- `tests/calc.test.ts` — 38 tests, including a pass over every fineness.

**Decision — compute in whole kopecks.** The price becomes kopecks, the mass
milligrams, and the multiplication is integer. `0.1 * 3` in a double gives
`0.30000000000000004`; on a sum of several hundred roubles that is a kopeck of
disagreement — and disagreement with the counter's sum is exactly what brought
the visitor here.

**Decision — input is parsed, not "understood".** Comma and dot are
equivalent, thousands separators (including non-breaking ones) are dropped.
Everything else is refused. One could "guess" that `8..4` means 8.4, but
guessing here means computing something other than what was typed.

**Decision — an empty field is not an error.** A separate `empty` reason and an
`isEmptyInput` helper, so the page does not style "введите массу" as a fault.

**Decision — an upper bound on the entered mass.** Above it the page says
"проверьте массу". The number was mine (the brief has none); I first set
100 000 g, and the client later lowered it to **10 000 g** — nobody carries
more than ten kilograms of gold into a buyback counter (QUESTIONS.md, D8).

**Decision — the mass is not rounded to weighing precision.** The brief gives
the acceptance precision (gold 0.01 g), but applying it to the entered number
would silently change the input. The precision went into the page copy and
stays out of the arithmetic.

**Decision — bespoke formatting rather than `Intl.NumberFormat`.** A number
must look identical on the server and in the browser whatever locale the
visitor has. Thousands separated by a non-breaking space, comma for decimals.

*Note for later:* invisible characters (the non-breaking space) are written in
code only as escape sequences. Written literally they are normalised to an
ordinary space somewhere along the way, and the test starts comparing a string
with itself. This cost me time once already.

---

## Step 5 — the homepage in the "no figure" state

Built first, on an empty `data/tariffs.json`, as required. It is the only state
the site can show right now.

**Done**

- `src/styles/tokens.css` — palette, typefaces, radii, grid. The mockup had it
  all inline; the values were lifted from there and the names grouped by role.
- `src/styles/global.css` — reset, typography, components.
- `src/layouts/Base.astro` and the `Hallmark`, `PriceCard`, `WithheldPanel`,
  `Calculator`, `History`, `Bullion`, `Photo` components.
- `src/lib/copy.ts` — every piece of state-dependent copy in one module.
- Self-hosted fonts via `scripts/fetch-fonts.mjs`.
- `scripts/shoot.mjs` — screenshots plus a horizontal-overflow check.

**Fonts.** `Onest`, `Golos Text` and `Martian Mono` all have real Cyrillic —
HANDOFF's worry about weak ж/д/б in Martian Mono did not hold up; Google Fonts
ships a full Cyrillic subset for it.

The stock `cyrillic` + `latin` ranges cost 333 KB across seven weights, which is
the entire page budget. I used the `text=` parameter instead: a subset covering
exactly the glyphs needed (Cyrillic, Latin, digits, `№ — · ×` and the rest from
the mockup), **94.8 KB across seven weights**. Preload only Onest 700, as asked.

**Decision — there are actually three "no figure" states, not one.** The mockup
draws one (`withheld`), but by the step 3 logic there are three and their copy
differs:

| reason | when | archive figure |
|---|---|---|
| `expired_no_successor` | the period ended, no successor | yes |
| `not_yet_effective` | the act exists but has not taken force | no |
| `no_records` | nothing transcribed (today's state) | no |

The third is what runs now: the file is empty, no past figure exists, so the
"архив — не цена на сегодня" block **is not rendered**. Showing it empty or
dashed would hint at a figure that does not exist.

**Decision — "we check every hour" was removed from the copy while it is
untrue.** The mockup's panel promises hourly checks and HANDOFF requires the
time to come from a real log. There is no worker yet and `status.json` is
empty. So the copy depends on whether a log exists: with a stamp, "we check
Minfin hourly"; without, "we reconcile against the Minfin site; a person
transcribes the figures". The promise arrives together with whoever keeps it.

**Decision — the footer shows the source instead of a check time.** Putting the
build time there is not possible: a build is not a check. While
`status.last_checked` is empty the footer shows "источник — minfin.gov.by".

**Objection — the jewellery-chain wording.** The mockup said "Ювелирные сети
иногда платят выше этой цены: по своим программам выкупа или при обмене…". The
first half asserts that someone pays more than someone else for ordinary cash
buyback; that cannot be, the tariff is identical for all, and HANDOFF itself
flags the sentence as unsupported. Rewritten: above-tariff happens only as a
trade-in credit against a new purchase, which is a different transaction. The
mechanism is described and nobody's terms are quoted. Affected: the "бывает
иначе" callout, the note beside the calculator, the "Обмен на новое изделие"
card, and step 01 on `/kak-proverit-otsenku`.

**Decision — with empty data the fineness table still shows all nine rows,
dashed.** That is the list of finenesses the site covers, not prices. An empty
card in its place would say less.

**Decision — with zero records the history section is not rendered at all**, and
the sparkline appears from three points. A "no history yet" card takes up room
and says nothing.

**Decision — the mockup's state toggle did not ship.** It was a review
affordance. The working state is inspected by swapping the data directory
(step 6).

**Checked by eye** at 360 / 768 / 1200 px: `scripts/shoot.mjs` compares
`scrollWidth` against the viewport and names the offending element. There is no
horizontal scroll at any width.

---

## Step 6 — the homepage in its working state

**Done**

- `tests/fixtures/valid-state/` and `tests/fixtures/expired-state/` — two data
  directories supplied through `GOLD_DATA_DIR`. They never reach `data/` and
  cannot: `tests/data-integrity.test.ts` sees to that.
- `npm run dev:valid`, `dev:expired`, `build:valid`, `build:expired`.
- `scripts/smoke.mjs` — checks the calculator in a real browser.

**Decision — fixtures dated 1999–2001, the record in force expiring 2099.** Two
requirements collided here: a fixture must be unmistakably fake, and it must
resolve to `valid` today. Dates of 1999–2001 could never pass for real, and an
expiry of 31.12.2099 keeps the state `valid` without an annual edit. Prices are
single-digit BYN per gram, two orders of magnitude below real ones. A separate
test asserts that `valid-state` really resolves to `valid` and `expired-state`
to `review_required`: a fixture that rots silently is worse than none.

**Decision — a yellow-and-black banner on builds with substituted data.**
`data.ts` knows the directory was overridden and `Base.astro` renders an
unmissable strip reading "Сборка на тестовых данных" with the directory path. A
build carrying invented figures must have no chance of passing for the real site.

**Found by the smoke test.** The fineness-table row highlight did not follow the
selected fineness: the script looked for `[data-tariff-row]` and the attribute
was not in the markup. Unit tests could not catch it — the arithmetic was
correct, the wiring was not. Fixed.

**Verified in a browser:** the sum for 10 g at the headline fineness matches the
price the server rendered into the table; switching fineness recomputes; `8,4`
with a comma parses; "много" gives "только цифры" and `aria-invalid`; with no
decree in force the fields are disabled, `#tariff-payload` is absent from the
markup, and there is no BYN sum anywhere on the page.

---

## Step 7 — /kak-proverit-otsenku and /o-proekte

**Done**

- `src/pages/kak-proverit-otsenku.astro` and `src/lib/procedure.ts` — five
  steps, the scales photograph, the "если что-то не так" callout.
- `src/pages/o-proekte.astro` — sources, a "how we handle figures" section, the
  error-report form.
- `src/components/ReportForm.astro` and `src/scripts/report-form.ts` — all six
  states from the mockup: idle, invalid, sending, sent, dupe, failed.

**Objection — the acceptance procedure was not reconciled with the primary
source.** The brief says "verify against the published instruction before
writing it". There was nothing to verify against: the instruction itself was
not available to me, and a second-hand retelling is by definition unacceptable
on this site. The text was assembled from the brief and the mockup, including
the weighing precision (gold 0.01 g, silver 0.1 g). **This is the only place on
the site where claims are not backed by a primary source** — the warning also
sits at the top of `src/lib/procedure.ts`. Reconcile line by line before
production.

No deduction percentage is named anywhere: the brief explicitly forbids
inventing one, so only the procedure is described.

**Decision — `novalidate` on the form.** The browser's own validation
intercepts submit before the handler and shows a bubble in the browser's UI
language. The mockup's wordings are more specific ("Адрес почты выглядит
неполным — без него мы не сможем ответить") and must be Russian regardless of
browser. `required` and `minlength` remain for assistive technology; the real
check is on the server anyway.

**Found by the smoke test — the bot honeypot was on `.sr-only`.** That is
exactly backwards: `.sr-only` exposes content to screen readers, so a blind
visitor would have encountered the trap field and might have filled it in.
Replaced with a dedicated `.honeypot` class that moves the field off-screen
entirely, plus `aria-hidden` and `tabindex="-1"`. The test now checks all three
properties.

**Decision — no "who runs this project" block.** HANDOFF notes the client
skipped it deliberately. In its place, a "Как мы обращаемся с цифрами" section:
it answers the same trust question without requiring me to invent facts about
people.

**Decision — source links point at section roots.** Пробирная инспекция has no
link at all: I never verified the address of its page, and an unverified link
in a section called "Sources" is the same sin as an unverified figure.

---

## Step 8 — the form: worker, Turnstile, rate limit, Resend

**Done**

- `worker/src/contact.ts` — `POST /api/contact`. Honeypot → field validation →
  Turnstile → rate limit → "already under review"? → email via Resend.
- `worker/src/ratelimit.ts`, `worker/src/turnstile.ts`, `worker/src/env.ts`.
- `src/lib/contact.ts` — rules and wordings shared by browser and worker.
- `wrangler.toml` with no secret in it, `DEPLOY.md` with the full list.
- 34 tests: the network and KV are faked, so wrangler is not needed.

**What is stored — and what is not.** No message, no sender address, no IP in
the clear. KV holds numbers only:

| key | value | TTL |
|---|---|---|
| `rl:<sha256(salt+ip)>` | rate counter | 1 hour |
| `act:<decree number>` | `{count, since}` | 30 days |

A dedicated test snapshots both stores after a request and asserts there is no
email address, no message text and no IP.

**Decision — the per-decree counter exists despite "store nothing" in the
brief.** The mockup draws an "уже в работе" state with the decree number, a
date and a report count; without a counter it cannot be built. The compromise:
only a number and a date, keyed by decree number — nothing that relates to a
person. If even that is unwanted, remove two calls in `contact.ts`
(`readActCounter` and `bumpActCounter`) and the rest keeps working.

**Decision — Turnstile is mandatory only in production.** Outside it,
verification runs only when a key is set; otherwise local development would
require a real Turnstile. In production, with no key the worker fails with a
clear error — substituting a placeholder would be worse than not working.

**Objection — HANDOFF asked for no captcha** ("a captcha breaks the page's
tone"). The overnight brief's Turnstile requirement takes precedence, but the
objection is reflected in the choice: Managed mode, which usually asks nothing
and renders as a strip. How to remove it entirely is written in `turnstile.ts`
and in `DEPLOY.md`.

**Decision — Resend refusing means an honest 502 and the "didn't send" state.**
Answering "accepted" about an email that never went would lose the report
silently. The form has a designed state for this, with a direct address.

**Decision — a filled honeypot gets an "accepted" answer.** There is no reason
to tell a bot it was spotted. No email is sent.

**Decision — ticket format `GB-482913`, six digits instead of the mockup's
four.** Same shape, two orders of magnitude fewer collisions. The real record of
a report is the email itself; the number exists so a person has something to
quote.

**Found by a test — `\b` does not work before Cyrillic.** In JavaScript a word
boundary is defined via the ASCII class `\w`, so `/\bпостановление/` never
matches and the decree number was never extracted from the text. Replaced with
a `(?<!\p{L})` lookbehind and the `u` flag.

---

## Step 9 — the scheduled source check

**Done**

- `worker/src/minfin.ts` — the Minfin page parser.
- `worker/src/proposal.ts` — the draft record and the PR/issue text.
- `worker/src/github.ts` — branch, files, pull request, issue via the REST API.
- `worker/src/scheduled.ts` — the run itself; `worker/src/index.ts` — the cron
  handler.
- Six fixtures in `tests/fixtures/minfin/`, 51 tests.

### The live page was read — and it disagrees with the mockup

Minfin's page turned out to be reachable, so I took the structure from it. Two
disagreements, both material.

**1. Nine finenesses, not six, and a different set.**

Mockup: 375, 500, 585, 750, 958, 999.
The act: **375, 500, 583, 585, 750, 900, 916, 950, 958**.

- **583** is the Soviet standard. For inherited jewellery it is very likely the
  most common fineness there is, so its absence would have been a hole exactly
  where the site matters most. In the table 583 and 585 **share a cell and a
  price** — the parser accounts for that.
- 900, 916 and 950 were missing from the mockup too.
- **999 is not in the scrap table.** Pure gold has its own line ("per gram of
  metal in fineness") and appears under bullion. Showing 999 among scrap
  finenesses would promise a price the act does not state.

`FINENESSES` now matches reality; fixtures and tests updated. At 360px the nine
buttons wrap onto two rows and the table does not scroll.

**2. The page carries neither the effective date nor the expiry.**

It has only "ПРИЛОЖЕНИЕ к постановлению … DD.MM.YYYY № N" and the tables. Both
dates live in the text of the act. That changes the shape of this step
entirely: **the parser physically cannot assemble a complete record.**

Hence the central decision: **the pull request the worker opens is deliberately
red.** The draft carries `effective_from: null` and `stated_expiry: null`, the
schema rejects such a record, and the PR check fails. Merging it without
opening the act and filling both dates in by hand is impossible. The red check
is not an annoyance; it is the gate. The PR body says so outright, with the
procedure and the reminder: if the act names no end date, leave `null`.

### What the worker does

| case | action |
|---|---|
| same act | nothing |
| new act | branch + draft + raw HTML as evidence + PR |
| a PR about this act is already open | nothing, no second one |
| parsing failed | issue + `block:publish` flag in KV |
| the block flag is set | nothing, until cleared by hand |
| the source did not answer | nothing: a 503 is no reason to block |

The check timestamp is written to KV regardless of the parse outcome — the page
really was looked at, and the footer is entitled to say so.

**Decision — block on a parse failure.** Changed markup is more dangerous than
missing data: the parser may start reading a neighbouring table and emit
plausible but wrong figures. So a parse failure is not "we'll skip this round"
but a stop until a human intervenes.

**Decision — several acts on a page means refusal.** That is what the archive
looks like. Picking "probably this one" is not allowed: a wrong pick gives a
wrong price.

**Decision — a cell with letters inside the price block means
`column_mismatch`.** A one-column shift is the most dangerous failure precisely
because its result looks plausible.

**A move above 15%** is flagged as a warning in the PR body and does **not**
prevent the data being accepted, as required.

### Fixtures

Six of them, all hand-built: the structure comes from the live page, the numbers
are knowingly fake (`TEST-*`, single-digit BYN prices). The real HTML is not
committed — it contains real prices, and anything resembling a price in a
repository is eventually taken for data. The one place real HTML does enter the
repository is as an attachment to the PR, where it is an exhibit, not a source.

The act-number pattern had to be widened to accept letters: otherwise fixtures
would have needed plausible numbers.

### Not done: NBRB

**`bullion.json` stays empty and there is no NBRB fetcher.** `www.nbrb.by` is
unreachable from this machine (the connection drops; only `api.nbrb.by/exrates`
answers, and that is currency rates, not bullion). I found no documented
endpoint for bullion prices, and writing a parser for a page I have never seen
is composition, not parsing.

The bullion section survives it: with no data it shows an explanation and a
link to nbrb.by, without a single figure.

Worth noting that bullion buyback prices **are on the same Minfin page**, in
their own table, with the surcharge. That is a verified source and cheaper to
add than building an NBRB scraper. But it is a scrap-buyer's price for a bar
rather than a National Bank quote — the two must not be mixed, and the decision
about what to show is yours.

---

## Step 10 — the search layer

**Done**

- `sitemap.xml` and `robots.txt` generated; three URLs, no generator package.
- `canonical`, Open Graph, `twitter:card`, `theme-color` in `Base.astro`.
- Russian `title` and `description` on every page; on the homepage they
  **depend on the state** — in the "no figure" state the title says so.
- JSON-LD `WebSite`.
- Search Console and Yandex Webmaster verification via environment variables;
  with no code, no tag is emitted.
- GA4 behind a consent notice.

**Decision — `lastmod` in the sitemap comes from the data, not the build
time.** A rebuild that changes no figures is not a change to the page. Telling a
search engine otherwise teaches it not to believe us.

**Decision — no Product/Offer markup with a price.** The temptation is real:
price, currency, a rich snippet in results. But the site sells nothing, the
state sets the price, and in the "no figure" state a machine-readable price
would also be stale — precisely the case this project exists to prevent. JSON-LD
is limited to `WebSite`.

**Decision — analytics consent lives in a first-party cookie.** `localStorage`
is forbidden by the brief and the choice has to be remembered. The cookie is
functional, `SameSite=Lax`, 180 days. Without consent GA4 never loads at all:
the `googletagmanager.com` tag does not enter the document.

**Decision — without `PUBLIC_GA4_ID` nothing renders.** Neither the tag nor the
banner. A "we use cookies" bar in the absence of the one cookie would be noise.

Analytics is GA4 only. No Metrica, no VK, no Mail.ru, as required.

**Weight.** HTML with inlined CSS: 36 / 28 / 32 KB. JavaScript: 4.4 KB for the
whole site. Fonts 94.8 KB separately. The "150 KB excluding fonts" budget holds
with room to spare.

---

## Final sweep for leaked figures

Before the last commit I grepped the whole repository for anything resembling a
real price or act number outside `data/` and the fixtures.

Found and removed:

- a comment in `tests/data-integrity.test.ts` that quoted real prices as an
  example of what the regex catches;
- a string in `tests/scheduled.test.ts` used for a base64 round-trip that
  carried a plausible price;
- act numbers in the report-parsing tests that were plausible ("№ 41", exactly
  as in the mockup). Replaced with "№ 9999": the parser's numeric path is still
  exercised, but it cannot be confused with a real act.

What remains, and should: `gold-by-build-notes.md` and `handoff/` — the client's
own source material, untouched.

**`data/` still holds two empty arrays.**

---

## Language conversion (after the fact)

Originally every document and code comment was written in Russian, on the
reasoning that the repository should match the site. That was the wrong call,
and it was made without asking: the site's copy is the product and must be
Russian, but the documentation and comments are read by the developer, who had
been writing in English throughout.

Converted to English: all documentation, every code comment, test names, the
worker's PR and issue text, schema validation messages, and the commit messages
(via rebase — the repository had no remote at the time the history was written).

Left in Russian, deliberately:

- everything a visitor sees — page copy, form messages, the calculator's
  refusal text, month names and date formatting;
- Russian text the parser matches against, and Russian input and expected
  output inside tests;
- the Minfin HTML fixtures, which have to look like the source page.

`QUESTIONS.md` was added at the same time: the blocking questions and the
decisions taken without the client, in a form that can be annotated in place.
`scripts/answers.mjs` reports which items have been answered.

---

## Parser verified against the real page

A weakness flagged in the morning report was that the Minfin fixtures are my
own reconstruction: if I had misread the markup, the tests would confirm my own
misreading. That is now resolved.

I ran the real parser over the copy of the live page fetched at 09:25 on
29 July 2026. It returned:

- act number and act date extracted correctly;
- **all nine finenesses**, matching the corrected `FINENESSES` list exactly;
- **no warnings** — so nothing was missing and nothing unexpected appeared;
- 583 and 585 resolved to the same price, confirming the shared-cell handling.

The hand-built fixtures were faithful. This cannot be made into a repeatable
test, because the real HTML must not be committed (it contains real prices).

The same run also settled the other open question definitively: a search of the
whole page for effective/expiry wording found **nothing**, and the only date
anywhere in the document is the act date. That is the evidence behind the
deliberately-red pull request (step 9): the parser genuinely cannot produce a
complete record, so the gate is not a design preference but a fact about the
source.

---

## The acceptance procedure, reconciled against the act

The morning report flagged `/kak-proverit-otsenku` as the one place on the site
whose claims were not backed by a primary source. That is now largely closed.

The governing act is **Council of Ministers resolution № 1211 of 12 September
2011**, "О правилах скупки у граждан драгоценных металлов и драгоценных камней
в изделиях и ломе" (National Register 5/34430). Its verbatim original text is
published in the National Register, and every step now cites the point it comes
from.

**Confirmed by the act.** All operations in the seller's presence (p. 9). The
scales positioned so the seller can satisfy themselves as to the mass (p. 11).
Removable non-precious parts taken out with the seller's agreement and returned,
then the item re-weighed; where removal is impossible the correction is agreed
with the seller (p. 13). Documents completed once the seller agrees to the
valuation (p. 14). No return after payment (p. 15).

**The weighing precision was right** — 0.01 g for gold, 0.1 g for silver — and
the act adds a detail the brief did not carry: "без учёта математического
округления". That is now on the page.

**Removed as unsourced.** "Поверенных весах" and "с нулём на пустой чаше" were
mine, not the act's; it says only that the scales are placed so the mass can be
checked. Both are gone, from the steps, the photo caption, the alt text and the
page description.

**Gained.** Point 6 gives a concrete right the brief had missed: the buyback
point must display the current prices, a copy of the licence **and an extract
from the Rules covering how mass, assay and valuation are determined**. That
became step 01, and it is more useful than what it replaced.

**Still open.** The act was amended three times (№ 246/2017, № 301/2023,
№ 268/2025) and the consolidated text sits behind ЭТАЛОН's subscription.
Nothing on the page asserts anything the 2011 original does not say, but a
provision could have moved since. The warning at the top of
`src/lib/procedure.ts` now says exactly that, rather than "unverified".

## Sources confirmed

- State assay supervision: `minfin.gov.by/ru/activities_jewels/probirka/`,
  H1 "Государственный пробирный надзор". Linked from /o-proekte, and the entry
  renamed to match what the body is actually called.
- The buyback rules themselves are now a fourth entry under Sources.
- The National Bank remains unreachable: `www.nbrb.by` and `nbrb.by` time out
  over both HTTP and HTTPS while `api.nbrb.by` answers instantly. Not a VPN
  artefact — it persists with the VPN off, when every other Belarusian host
  responds normally.

## Price history imported from the year archive (2024 onward)

The Ministry keeps a year-by-year archive of superseded acts at
`…/activities_jewels/fund/pokupka/fizlic/archive/<year>/`, with index pages from
2003 to 2026. Each carries every act of that year in full: number, signature
date, and all four price tables.

**Where it stops, and why.** Only from partway through 2024 do those pages state
the date an act took force. Surveyed on 29 July 2026: 2026 all five, 2025 all
four, 2024 two of four, and **nothing before that**. `effective_from` is
mandatory precisely because a price without a period is not a publishable fact,
and deriving one from the signature date is the inference this project exists to
refuse. So the import stops at the first act that states its own start date —
2024-10-12, № 50 — and the two 2024 acts without one were skipped, by name, in
the import output rather than silently dropped.

**Eleven records, ten added.** Act № 31 of 08.07.2026 was already held from the
act's own PDF, and a record read from the act always wins over one read from the
archive. That overlap turned out to be the most useful part of the exercise: it
gave a way to validate the extractor. Re-reading № 31 from the archive page
reproduced, digit for digit, all nine prices transcribed independently from the
PDF. The extraction path is therefore checked against known-good output, not
merely plausible.

**The extractor refuses rather than guesses.** It reads the fineness header row
and the gold row as cells, expands each header cell to the finenesses it names
(583 and 585 share one merged cell), and requires the expansion to equal the nine
known finenesses exactly and the cell counts to match. Anything else is reported
as a problem and the act skipped. Across 2024–2026: thirteen acts, no failures.

### The design problem: an expiry that was never read

The archive pages carry no act text, so whether an act named an end date is
unknown. `stated_expiry: null` already means something specific — "the act names
no end date" — and writing it here would assert something unverified. Inventing a
date was never an option.

**Decision.** A new optional field, `transcribed_from: 'act' | 'archive'`,
defaulting to `'act'`. On an `'archive'` record `stated_expiry` must be `null`,
and there it means "not read". The schema rejects an archive record that states
an expiry, since such a date could only have come from somewhere unrecorded.

One `null` with two meanings would normally be a trap. It is made unable to
matter instead of being documented away: **an archive record can never be the act
in force.** `resolveTariffState` excludes it from `current`, `lastKnown` and
`upcoming`; it appears only in `history`. So no figure the site shows as current,
and no figure it keeps as the last known one, ever rests on an unread expiry —
and importing history cannot change the price on the homepage. Six tests hold
that line, including the dangerous ordering where the archive record takes force
*after* a real act has lapsed, which is where an open-ended unread record would
otherwise show a figure for ever.

Provenance rather than policy, deliberately: the field states where the figures
came from, and the code derives what may be done with them. A boolean called
`history_only` would have invited someone to flip it.

**A bug this surfaced.** The "nothing has taken force" branch returned
`history: []`. That was equivalent before — if nothing had taken force there was
no history — but archive records can take force while no governing act has. It
now returns the real history. Found by a test written for the new rule, not by
reading the code.

### What the history displays

Archive rows print only the start date, "с 6 ноября 2025". Deriving the end from
the next act's start would assume the two are contiguous, which is not known
either — there may have been a gap where the figure was withheld. The current
act, read from the act itself, still shows its full period.

The series is visibly non-monotonic — 237.94 in April 2026 down to 202.18 in July
— which is worth noting given the brief's ban on trend and forecast language. The
footer hedge stays: "Постановления выходят нерегулярно."

### Not done, and why

- **Before 2024.** Needs a decision, not a script: either stop here, or accept
  records with no effective date at all, which would mean a second and weaker
  class of record than the archive one added here.
- **Pre-July-2016 anything.** Belarus redenominated on 1 July 2016 at 10 000:1.
  A series crossing that boundary is meaningless without conversion and a loud
  label.
- **Per-fineness history.** `priceSeries(state, fineness)` is already
  parameterised and the data now spans twelve acts, so the remaining work is a
  selector and deciding how to render a fineness an older act does not name.
  583 and 585 must not pose as two independent series: they are one number.
