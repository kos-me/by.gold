# Questions and decisions

A working document between us. Everything that needs your call, and everything
I decided alone that you can overturn.

## How to answer

Each item has this line:

```
**Answer:** _(unanswered)_
```

Replace `_(unanswered)_` with your text — any language, a single word is fine.
Anything still carrying that marker I treat as unanswered and leave alone.

To see what's where:

```sh
node scripts/answers.mjs
```

It prints what you've answered and what you haven't. It changes nothing.

---

## About those commits

You didn't give me a repo — the folder wasn't one. I ran `git init` myself
because the brief asked for a commit per step and a clean tree.

**Since then you gave me `git@github.com:kos-me/by.gold.git` and it is pushed
there**, with the history rewritten into English commit messages.

---

## Where things stand

Everything you answered has been acted on. Nothing is waiting on me.

| # | question | state |
|---|---|---|
| **B1** | Transcribe the current decree | ✅ done — every field now traced to a Ministry source |
| **B2** | Check the counter-procedure text | ✅ done against the 2011 act; 3 amendments unread (ЭТАЛОН) |
| **B3** | What to do about bullion | ⏳ **your call** — NBRB unreachable, I recommend option (b) |
| **B4** | Accounts and secrets | ✅ answered; templates committed. **Nothing needed until you deploy** |
| **B5** | Rights to the photographs | ✅ ignored, as instructed |
| **B6** | The `pravka@gold.by` mailbox | ✅ removed from the site entirely |
| **B7** | Link to the assay supervision | ✅ confirmed and linked |
| **B8** | The domain | ✅ noted, nothing to change |
| **D8** | Input cap | ✅ lowered to 10 000 g |
| **D1–D16** (rest) | decisions made on your behalf | unanswered → standing as built, which is safe |

### What is still open

1. **B3, bullion.** Three options below; I recommend (b).
2. **A one-day source conflict on act № 31.** The archive page dates it from
   17 July, the page that carried it while it was in force from 18 July. Same
   act, same prices. `effective_from` keeps 18 and the record's `notes` records
   the disagreement. See "The 17-versus-18 July conflict" below.
3. **A daily rebuild, at deploy time.** Not a question either, but it has to
   be set up or the 1 August handover below will not happen on its own. See
   DEPLOY.md, "The site must rebuild on a schedule".

None of these block anything else. The site builds, deploys and works as is.

### The 1 August handover is already in the data

Act № 31 dies by its own terms on 31 July 2026. Its successor is transcribed:

| act | in force | expires |
|---|---|---|
| № 31 of 08.07.2026 | 18 July 2026 | 31 July 2026 |
| № 34 of 28.07.2026 | 1 August 2026 | names no end date → `null` |

No gap, no overlap. Today the site shows № 31; from 1 August it shows № 34 and
keeps showing it until an act replaces it, because № 34 contains no "действует
по" clause at all. `stated_expiry: null` is a real property of that act, not a
missing transcription — do not fill it in.

Two things worth knowing about № 34:

- It names its own effective date, in point 2: "Настоящее постановление
  вступает в силу 1 августа 2026 г." No inference needed this time.
- Point 1 lowers the Белскупдрагмет bullion surcharges to 4.5 % for gold and
  2.5 % for silver, from 5.5 and 4.5 in № 31. That matters only for B3.

**The one thing that must happen for the handover to take effect** is a
rebuild on or after 1 August. Until then a build made in July keeps serving
№ 31, and past 31 July the client-side guard blanks the figure — which is safe
but wrong, because a valid successor is sitting in `data/tariffs.json` unable
to reach the page. Hence item 3 above.

The Ministry is reissuing these roughly monthly: № 27 on 18 June, № 31 on
8 July, № 34 on 28 July.

### The 17-versus-18 July conflict

Two Ministry pages disagree about when act № 31 took force, by one day:

| page | says |
|---|---|
| the prices page, while № 31 was current (and the news announcement) | in force **from 18 July 2026** |
| the 2026 year archive, now that it is superseded (`…/archive/2026/`) | in force **from 17 July 2026** |

It is definitely the same act: same number, same signature date, and Table 1 in
the archive matches this record digit for digit. The Belarusian-language version
of the archive says 17 as well, so it is not a translation slip.

`effective_from` stays at **2026-07-18** — the value published on the page cited
in `source_url`, while the act was actually governing transactions, and repeated
in the announcement. The disagreement is written into the record's `notes` rather
than quietly resolved.

The likely explanation is that one page gives the publication date and the other
the day commencement follows it, but confirming that needs the act's National
Register entry, which is behind the ЭТАЛОН subscription. If you have access, that
settles it in a minute.

Nothing on the site is materially wrong either way: the only visible effect is
the period reading "18 — 31 июля" instead of "17 — 31 июля", and the record
becomes historical on 1 August. **The lesson matters more than the day** — the
archive is not always identical to what the live page said at the time, which
constrains how far back history can honestly be built.

### Price history: what is possible, and where it stops

Two things you asked about.

**Per-fineness history — already most of the way there.** The homepage has a
"Как менялась цена" block with a sparkline and a table, and the function behind
it, `priceSeries(state, fineness)`, is already parameterised by fineness. It is
currently pinned to 585. Letting it follow the calculator's fineness selector is
a small change. Two things to get right when doing it: 583 and 585 share one
number in the source, so their series are identical and should not pretend to be
two independent lines; and a fineness missing from an older act must render as a
gap, not be silently closed up, or the chart implies a continuity that is not
there.

> **Update: the import is done.** Ten records added from the year archive, so
> the site now carries twelve acts — from 12 October 2024 to 1 August 2026.
> Details in IMPLEMENTATION-LOG.md; the rest of this section is the survey it
> was based on and still describes where the archive stops being usable.

**Importing old acts — possible, but only back to 2024.** The Ministry keeps a
year-by-year archive at `…/archive/<year>/`, with index pages from 2003 to 2026,
each carrying the full four tables for every act of that year. Surveyed on
29 July 2026:

| year | acts listed | carry an effective date |
|---|---|---|
| 2026 | 5 (+ № 34) | all |
| 2025 | 4 | all |
| 2024 | 4 | 2 of 4 |
| 2023 and earlier | 1–7 per year | **none** |

That last column is the blocker. Before 2024 the archive publishes the act's
number, its signature date and its prices — but **not the date it took force**,
and `effective_from` is a required field precisely because a price without a
period is not a fact you can publish. Deriving it from the signature date is the
exact inference this project refuses to make.

So:

- **2024 onward** is importable within the current rules: roughly ten to twelve
  acts, about two years of history. Worth doing.
- **Earlier than that** needs a deliberate decision, not a script — either stop
  at 2024, or extend the schema with an archive-only record that carries no
  effective date, can never be the current act, and is labelled by act date
  rather than by period. That is a design choice for you.

Two more caveats for anything going further back:

- **The currency changes.** Belarus redenominated on 1 July 2016 at 10 000:1.
  The 2016 acts in the archive are already in new roubles, but anything before
  that is in old ones, and a series crossing that boundary is meaningless
  without conversion and a very clear label.
- **The table structure changes.** Older pages do not use the merged 583/585
  cell and do not lay the metals out the same way, so the existing parser cannot
  be pointed at them unverified. Each era needs checking against the page it
  came from.

Nothing was invented to fill a gap. The two 2024 acts with no stated start date
were skipped by name, not quietly dropped.

---

# Part 1. Blocking

## B1. Transcribe the current decree

**Status:** ✅ done — one field still wants a human eye (see below)

_The question below is kept as it was asked; the outcome follows it._

_(As asked, when the file was still empty.)_ `data/tariffs.json` is an empty
array. That isn't an omission — the site knows how to run that way and shows
the "no verified figure yet" state. But the figure is what it exists for.

It has to be transcribed **from the act itself**, not from the Minfin summary
page and not from news coverage. Two things come only from the act and appear
nowhere on the page: the date it takes force and the date it expires.

```jsonc
{
  "act_number": "…",               // as printed in the act, without «№»
  "act_date": "YYYY-MM-DD",
  "effective_from": "YYYY-MM-DD",  // from the text of the act
  "stated_expiry": "YYYY-MM-DD",   // OR null if the act names no end date
  "source_url": "https://minfin.gov.by/…",
  "transcribed_at": "YYYY-MM-DDTHH:MM:SSZ",
  "transcribed_by": "your name",
  "prices_byn_per_gram": {
    "375": 0, "500": 0, "583": 0, "585": 0, "750": 0,
    "900": 0, "916": 0, "950": 0, "958": 0
  }
}
```

`npm run build` won't let you get the structure wrong: an invalid record fails
the build with a list of specific complaints.

I can transcribe it if you want — but I'd need an explicit yes, and I'd still
attach the source link and leave `transcribed_by` as you. A person should be
the one vouching for the figure.

**Answer:** Why don't you download recent act and fill data yourself?

> **Status: done. The site is live on real data.**
>
> `data/tariffs.json` now holds decree № 31 of 08.07.2026. I found the act
> itself — it is linked as a PDF from the Minfin page — and read it directly.
>
> - **Prices**: from the act's appendix, Table 1. They match, digit for digit,
>   what the parser independently read out of the HTML table. Two paths, same
>   numbers.
> - **stated_expiry = 2026-07-31**: point 3 of the act, verbatim —
>   "Настоящее постановление вступает в силу после его официального
>   опубликования и действует по 31 июля 2026 г."
> - **effective_from = 2026-07-18**: the act names no date of its own — point 3
>   defers commencement to "официальное опубликование". The Ministry supplies
>   the date twice: on the prices page directly above Table 1, "Вступает в силу
>   с 18 июля 2026 года", and in the news headline "Цены … с 18 июля 2026 г.".
> - **act_number = 31, act_date = 2026-07-08**: from the appendix heading
>   "08.07.2026 № 31" on the prices page. Worth knowing: the PDF is the
>   unsigned publication form and leaves both the number and the date blank, so
>   the heading is the only source for these two.
>
> **Why the effective date is not the act date.** They are different events.
> 8 July is when the Minister signed it. Official publication — inclusion in
> the National Legal Register — happens afterwards, and that is what point 3
> hangs commencement on. The act corroborates the gap itself: point 2 repeals
> resolution № 27 of 18 June 2026, and a repeal contained in an act cannot bite
> before that act is in force. So № 27 governed 8–17 July, № 31 from the 18th,
> and no two acts are in force at once. Reading `effective_from` as 8 July
> would put both in force simultaneously and contradict the repeal.
>
> Full provenance is recorded field-by-field in the record's own `notes`.

---

## B2. Check the counter-procedure text

**Status:** ✅ reconciled against the act (see below)

_The question below is kept as it was asked; the outcome follows it._

`/kak-proverit-otsenku` describes the procedure: assay in your presence,
certified scales, removable non-precious parts returned and the item reweighed,
correction agreed with you, precision of 0.01 g for gold and 0.1 g for silver,
documentation in hand.

Your brief said "verify against the published instruction before writing it."
There was nothing to verify against — I didn't have the instruction, and a
second-hand summary is not a source on this site of all sites. The text is
assembled from your brief and the mockup.

**This is the only place on the site where claims aren't backed by a primary
source.** The warning sits at the top of `src/lib/procedure.ts`.

Needed: walk the five steps line by line against the instruction. Give me a
link to the act or its text and I'll do the reconciliation myself.

**Answer:** Research act yourself online. Let me know if you fail

> **Status: done, with one gap left that money or a subscription fixes.**
>
> The governing act is **Council of Ministers resolution № 1211 of
> 12.09.2011**, "О правилах скупки у граждан драгоценных металлов и
> драгоценных камней в изделиях и ломе" (National Register 5/34430). I found
> its verbatim original text in the National Register and reconciled all five
> steps against it, point by point. `src/lib/procedure.ts` now cites the point
> number behind each step.
>
> What the act confirmed: every operation happens in your presence (p. 9); the
> scales are placed so you can satisfy yourself as to the mass (p. 11);
> removable non-precious parts come out with your agreement and are returned,
> then the item is re-weighed (p. 13); documents are filled in once you agree
> (p. 14); after payment there is no return (p. 15). **The weighing precision
> was right**: 0.01 g for gold, 0.1 g for silver — and the act adds "без учёта
> математического округления", which I have now included.
>
> What I removed, because the act does **not** say it: "поверенных весах" and
> "с нулём на пустой чаше". Both were mine. The act says only that the scales
> are positioned so you can check the mass.
>
> What I gained: p. 6 gives you a concrete right I had missed — the buyback
> point must display the current prices, a copy of the licence, **and an
> extract from the Rules**. That is now step 01.
>
> **The gap:** the act has been amended three times (№ 246/2017, № 301/2023,
> № 268/2025). The consolidated current text is only in ЭТАЛОН, which needs a
> subscription. Nothing on the page asserts anything the 2011 original does not
> say, but a provision could have changed. If you have ЭТАЛОН access, that is a
> ten-minute check.

---

## B3. Bullion: what to show

**Status:** ⏳ waiting on your choice of option

`bullion.json` is empty, there's no fetcher. `www.nbrb.by` is unreachable from
my machine (the connection drops; only `api.nbrb.by/exrates` answers, and that's
currency rates, not bullion). I found no documented endpoint for bullion prices,
and I wasn't going to write a parser for a page I've never seen.

Right now the section shows an explanation and a link to nbrb.by, no figures.

Options:

- **(a)** Leave it. The section routes a person with a bar to the right place
  and promises no numbers. Zero work.
- **(b)** Take the bullion buyback prices **from the same Minfin page** — they're
  there, in a separate table, with the surcharge. Verified source, the parser is
  already next to it, modest work. **But that's a scrap-buyer's price for a bar,
  not a National Bank quote** — different things, and the labelling has to be honest.
- **(c)** You give me the URL of the NBRB page with the prices (or its HTML) and
  I write a parser for it.

I'd take (b) — verifiable source, and it's the figure a person actually wants:
what they'll be given if they carry a bar in. But the call is yours, because
it's a question about what the site promises.

**Answer:** Try again, I connected VPN

> **Status: still blocked, and now clearly not the VPN.** With the VPN off,
> `minfin.gov.by`, `pravo.by` and `etalonline.by` all answer normally.
> `www.nbrb.by` and `nbrb.by` still time out on every attempt, over both HTTP
> and HTTPS, while `api.nbrb.by/exrates` answers in under a second. So the
> National Bank's web site specifically is unreachable from here; their API
> host is not.
>
> Which leaves your original three options unchanged. I still lean to **(b)**:
> bullion buyback prices are in the same act I already read — Table 4, with the
> 5.5% surcharge for gold and 4.5% for silver, both stated in point 1 of the
> resolution. It is a verified source and the parser sits next to it. It is a
> scrap-buyer's price for a bar rather than a National Bank quote, and the
> labelling would have to say so. Say the word and it is a small job.

---

## B4. Accounts and secrets

**Status:** ✅ answered — nothing needed from you until you deploy

Nothing is deployed: no Cloudflare, no Resend, no GitHub token. Everything reads
from the environment, and **there is no key in the repository, nor any dummy
key substituted to make something "work".**

Full list and procedure in `DEPLOY.md`. In short:

| secret | what for |
|---|---|
| `TURNSTILE_SECRET_KEY` | form verification |
| `RESEND_API_KEY` | sending mail |
| `REPORT_TO_EMAIL` | where reports arrive |
| `REPORT_FROM_EMAIL` | sender, on a verified domain |
| `RATE_LIMIT_SALT` | `openssl rand -hex 32`, once |
| `GITHUB_TOKEN` | open the PR with a new decree |
| `GITHUB_REPO` | `owner/repository` |

Plus public build-time ones: `PUBLIC_TURNSTILE_SITE_KEY`, `PUBLIC_GA4_ID`,
`PUBLIC_GOOGLE_SITE_VERIFICATION`, `PUBLIC_YANDEX_VERIFICATION`.

I won't deploy this myself and shouldn't. Tell me when the accounts exist and
I'll walk the `DEPLOY.md` checklist.

**Answer:** Does it make sense to create .evn file and put keys there? Or how do you want me to proceed?

> **Status: answered, and templates added.**
>
> Short answer: **no `.env` for real secrets.** Three different places:
>
> - **Production secrets** → `wrangler secret put NAME`. They live in
>   Cloudflare, never on disk, never in a file. This is the only place
>   `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY` and `GITHUB_TOKEN` should exist.
> - **Local worker development** → `.dev.vars` (Cloudflare's own convention,
>   already gitignored). I added **`.dev.vars.example`** to copy from.
> - **Build-time public values** (`PUBLIC_*`) → `.env`, also gitignored. These
>   end up in the HTML and are not secret. I added **`.env.example`**.
>
> Both example files are committed and contain no real values.

---

## B5. Rights to the photographs

**Status:** ✅ closed — ignored, as instructed

Your own HANDOFF flags it: three frames taken from the internet, rights
unverified, the scales shot especially (a crop of a catalogue photo). I didn't
touch them and can't verify them.

Either confirm the right to use them or reshoot. HANDOFF already has notes on
how to shoot them if it comes to that.

**Answer:** ignore, i don't care

> **Status: done — ignored as instructed.** The photographs stay as they are.
> Noting once, without pressing: the risk is a rights holder's claim, not
> anything technical, and it does not go away by our not looking at it.

---

## B6. The `pravka@gold.by` mailbox

**Status:** ✅ done

The address comes from the mockup. In the "didn't send" state the form offers
writing there directly — it's the last line of defence when everything else has
failed. No mailbox, no last line.

Different address? Tell me which and I'll change it in `src/lib/site.ts`.

**Answer:** no direct emails should be mentioned on website, only form

> **Status: done.** `pravka@gold.by` is gone from the site entirely, along
> with the `CONTACT_EMAIL` constant. The "didn't send" state now offers only
> "Повторить" and says the form is the only channel. Where reports actually
> land is the worker's `REPORT_TO_EMAIL` secret, which never reaches the
> browser.

---

## B7. Link to Пробирная инспекция

**Status:** ✅ done

In the Sources block on `/o-proekte` the assay inspectorate is named but
carries **no link**: I never verified the URL of its page, and an unverified
link in a section called "Sources" is the same sin as an unverified figure.

Give me the address and I'll add it. Related: `nbrb.by` currently points at the
root — I didn't confirm a deep link to the prices page either.

**Answer:** confirm links yourself

> **Status: done.** Confirmed and linked:
> `minfin.gov.by/ru/activities_jewels/probirka/` — H1 "Государственный
> пробирный надзор". It sits under the Ministry of Finance, so the entry is now
> titled that rather than "Пробирная инспекция".
>
> I also added a fourth source entry: the buyback rules themselves
> (resolution № 1211 on pravo.by), since the whole "Как проверить оценку" page
> now derives from them.
>
> The NBRB deep link is still unconfirmed — see B3; that host does not respond
> at all. The entry keeps the root `nbrb.by`.

---

## B8. The domain

**Status:** ✅ confirmed — nothing to change

`gold.by` is baked in as the canonical address (`astro.config.mjs`, via the
`SITE_URL` variable). Questions: is the domain yours? Is it on Cloudflare
(nameservers pointed at CF)? If not, what address goes in canonical and sitemap?

**Answer:** it's my domain, ns setup to cloudflare

> **Status: noted, nothing to change.** `SITE_URL` already defaults to
> `https://gold.by` and the canonical, sitemap and Open Graph tags follow it.
> Nothing further is needed until deployment.

---

# Part 2. Decisions made on your behalf

All of these are already in the code. **Say nothing and they stand.** Reversing
any of them is cheap except where noted.

## D1. I rewrote the claim about jewellery chains

**The mockup said:** "Jewellery chains sometimes pay above this price: under
their own buyback programmes or when trading an old item for a new one."

**Why I changed it:** the first half asserts that someone pays more than someone
else for ordinary cash buyback. That can't be true — the tariff is identical
everywhere — and your HANDOFF itself flags the sentence as unsupported. My brief
listed it under things not to do.

=> it can be true if you buy something from that chain at the same time. Verify, confirm or push back.

**Now:** above-tariff only happens as a trade-in credit when buying a new item
from a producer; that's a different transaction. The mechanism is described,
nobody's terms are quoted.

Affected: the "бывает иначе" callout, the note beside the calculator, the
"Обмен на новое изделие" card, step 01 on `/kak-proverit-otsenku`. Copy lives in
`src/lib/copy.ts`.

**If you say nothing:** my version stands.

**Answer:** _(unanswered)_

---

## D2. I dropped the "we check every hour" promise

The mockup promises hourly checking; HANDOFF requires the timestamp to come from
a real log. There's no worker yet and `status.json` is empty — nobody is there
to keep the promise.

Made it conditional: with a real check timestamp the text promises hourly;
without one it says "we reconcile against the Minfin site; a person transcribes
the figures." The footer shows the source link instead of a check time —
substituting the build time there would be false, because a build is not a check.

Once the worker runs, the promise appears by itself.

**If you say nothing:** the conditional version stands.

**Answer:** _(unanswered)_

---

## D3. There are three "no figure" states, not one

The mockup draws one. Logically there are three, and their copy differs:

| state | when | archive figure |
|---|---|---|
| expired | no successor published | shown |
| not yet in force | act exists, date hasn't arrived | none |
| nothing transcribed | today's state | none |

In the third, the "архив — не цена на сегодня" block **isn't rendered at all**:
no past figure exists, and hinting at one is not allowed.

**If you say nothing:** three states stand.

**Answer:** _(unanswered)_

---

## D4. Turnstile, though HANDOFF asked for no captcha

HANDOFF: "Anti-spam without a captcha: honeypot + rate limit by IP. A captcha
breaks the page's tone." The overnight brief: "Turnstile verification, honeypot,
server-side validation, rate limit in KV."

The brief wins, but the objection is sound, so I used **Managed** mode: it
usually asks the visitor nothing and renders as a thin strip.

To remove it entirely: drop the `verifyTurnstile` call in
`worker/src/contact.ts` and the widget in `src/components/ReportForm.astro`.
The honeypot and rate limit stay and keep working. Five minutes.

**If you say nothing:** Turnstile stays.

**Answer:** _(unanswered)_

---

## D5. A per-decree counter, though the brief said "store nothing"

The mockup draws an "уже в работе" state with the decree number, a date and a
count of reports. Without a counter it can't exist.

Compromise: KV holds **numbers only**, keyed by decree number:

```
act:<number>          {count, since}   30 days
rl:<sha256(salt+ip)>  a number         1 hour
```

No messages, no addresses, no IP in the clear. A dedicated test snapshots the
store after a request and asserts exactly that.

If even this is too much: remove two calls (`readActCounter`, `bumpActCounter`)
in `worker/src/contact.ts`. The "уже в работе" state then simply never shows and
the form always answers "accepted".

**If you say nothing:** the counter stays.

**Answer:** _(unanswered)_

---

## D6. Analytics consent lives in a cookie

`localStorage` is forbidden by the brief, and the choice has to be remembered.
I used a functional cookie `gold_consent`, `SameSite=Lax`, 180 days. Without
consent GA4 never loads at all — the `googletagmanager.com` tag doesn't enter
the document.

Without `PUBLIC_GA4_ID` neither the tag nor the banner is rendered.

**If you say nothing:** the cookie stays.

**Answer:** _(unanswered)_

---

## D7. No Product/Offer structured data with a price

Tempting: a price and currency in JSON-LD buys a rich snippet in search
results. I didn't: the site sells nothing, the state sets the price, and in the
"no figure" state a machine-readable price would also be stale — precisely the
failure this project exists to prevent.

JSON-LD is limited to `WebSite`.

**If you say nothing:** only `WebSite` stays.

**Answer:** _(unanswered)_

---

## D8. Input capped at 100,000 g

My number, not in the brief. Above it the calculator says "проверьте массу".
The point is catching a typo, not restricting anyone.

**If you say nothing:** 100,000 stands.

**Answer:** 10,000. I don't think anyone is selling more than 10kg of gold

> **Status: done.** `MAX_GRAMS` is now 10 000. Above it the calculator says
> "проверьте массу". The tests derive their bounds from the constant, so they
> followed automatically.

---

## D9. Mass isn't rounded to weighing precision

The brief gives the acceptance precision (gold 0.01 g, silver 0.1 g). Applying
it to the entered number would silently change the input. The precision is
stated in the page copy and kept out of the arithmetic.

**If you say nothing:** stands as built.

**Answer:** _(unanswered)_

---

## D10. Fonts: custom subset instead of the stock ranges

The stock `cyrillic + latin` ranges cost **333 KB** across seven weights — the
entire page budget. A subset via the `text=` parameter (Cyrillic, Latin, digits,
`№ — · ×` and the rest from the mockup) costs **94.8 KB**.

The price: a character outside the set falls back to a system font. Visible but
not broken; adding one is a single line in `scripts/fetch-fonts.mjs` plus a
regeneration.

Related: HANDOFF's worry about weak Cyrillic in Martian Mono **didn't hold up** —
Google Fonts ships a full Cyrillic set for it.

**If you say nothing:** the subset stays.

**Answer:** _(unanswered)_

---

## D11. The mockup's state toggle didn't ship

It was a review affordance. States are inspected by swapping the data
directory instead: `npm run dev:valid`, `npm run dev:expired`.

**If you say nothing:** no toggle on the site.

**Answer:** _(unanswered)_

---

## D12. No "who runs this project" block

HANDOFF notes you skipped it deliberately. In its place `/o-proekte` gained a
section **"Как мы обращаемся с цифрами"**: it answers the same trust question
(why this figure can be believed) without requiring me to invent facts about
people.

If you decide to add a real block about yourself, give me the text and I'll
drop it in.

**If you say nothing:** the numbers section stays.

**Answer:** _(unanswered)_

---

## D13. Purity set corrected against the source: nine, not six

Not really a "decision" — more a finding — but worth confirming, because it
changes both the table and the calculator.

- **Mockup:** 375, 500, 585, 750, 958, 999.
- **The act:** 375, 500, **583**, 585, 750, **900**, **916**, **950**, 958.

- **583 was missing from the mockup entirely** — the Soviet standard, and for an
  inherited ring or chain very likely the most common purity there is. In the
  table 583 and 585 share a cell and a price.
- **999 does not appear in the scrap table** — that's the pure-metal and bullion
  line. Showing it among scrap purities would promise a price the act doesn't state.

**If you say nothing:** nine purities, per the source.

**Answer:** _(unanswered)_

---

## D14. The worker's PR is deliberately red — that's the gate

The Minfin page carries **neither the effective date nor the expiry**; both live
in the text of the act. So the parser physically cannot assemble a complete record.

I turned that into the safety mechanism: the draft carries
`effective_from: null` and `stated_expiry: null`, the schema rejects it, and the
PR check fails. Merging it without opening the act and filling both dates in by
hand is impossible.

Side effect: a red check sits on the PR list, and that's normal. If it grates,
the alternative is writing the draft to a separate file (`data/incoming/…`) that
the build ignores — then the PR is green, but so is the gate. I'm for red.

**If you say nothing:** red PR stays.

**Answer:** _(unanswered)_

---

## D15. Check cadence

The brief says daily; the mockup promises hourly. I set Minfin to hourly and
bullion to daily (once it exists). Configured in `wrangler.toml`, the
`[triggers]` section.

**If you say nothing:** hourly and daily.

**Answer:** _(unanswered)_

---

## D16. Small things I decided silently

Listing them so none surfaces later as a surprise. Each is a one-line change.

- **`/api/contact`, not `/api/report`.** HANDOFF names the second, the overnight
  brief the first. I took the first; the response contract is HANDOFF's.
- **Ticket format `GB-482913`, six digits instead of the mockup's four.** Same
  shape, two orders of magnitude fewer collisions.
- **I introduced `data/status.json`** — it wasn't in the source material. Without
  it the footer can't honestly say when the source was last looked at.
- **Fixtures dated 1999–2001, the live one expiring 2099.** So they're
  unmistakably fake and still don't rot on their own.
- **A yellow-and-black banner** on any build using substituted data.
- **Silver and platinum aren't shown**, though they're on the same page of the
  act. The site is about gold. Adding them is about half an hour — say the word.
- **`build.format: 'file'`** — extension-less URLs with no redirects on
  Cloudflare Pages.

**Answer:** _(unanswered)_

---

## What happens next

Answer what you care about and leave the rest. I'll read the document, do what
has answers, and write back into this same file what got done. Anything
unanswered stays visible here rather than getting lost.


---

## Network note — resolved

While the VPN was up, every Belarusian host was unreachable (TLS handshake
reset). With it off, `minfin.gov.by`, `pravo.by` and `etalonline.by` all answer
normally, and everything that depended on them is done.

`www.nbrb.by` is the exception: it times out with the VPN off too, over both
HTTP and HTTPS, while `api.nbrb.by` answers in under a second. That is the
National Bank's web host being unreachable from here, not a tunnelling problem.

---

## Added after the act was read: a stale-build guard

Populating the data exposed a hole the empty state had been hiding.

The site is static, so the tariff state is decided **when the site is built**.
Act 31 lapses on 31 July. A build that stops being rebuilt would go on showing
202,18 as a current price into August — which is precisely the failure this
whole project exists to prevent.

So the browser now re-checks the expiry on every visit
(`src/scripts/staleness.ts`). Past it, the figure is withheld, the fineness
table goes to dashes, the calculator switches off and the price payload is
removed from the page. It can only ever take a figure away, never restore one,
and the replacement copy is server-rendered rather than assembled in
JavaScript.

Verified in a real browser with the clock faked to 2026-08-01: every field
flips. Unit tests cover the boundary, including the Minsk midnight either side.

This is defence in depth, not a substitute for the cron worker — it makes the
site honest rather than merely honest-if-rebuilt-on-time.
