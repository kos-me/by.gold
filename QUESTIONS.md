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
because the brief asked for a commit per step and a clean tree. **There is no
remote and nothing was pushed anywhere**; all 12 commits sit on your disk.
If you don't want it: `rm -rf .git`, nothing else changes.

---

## Summary

| # | question | if you say nothing |
|---|---|---|
| **B1** | Transcribe the current decree into `data/tariffs.json` | site stays in the "no figure" state |
| **B2** | Check the counter-procedure text against the instruction | the one unverified passage stays unverified |
| **B3** | What to do about bullion (NBRB) | section shows no figures, just a link |
| **B4** | Accounts and secrets | nothing is deployed |
| **B5** | Rights to the three photographs | can't ship to production |
| **B6** | The `pravka@gold.by` mailbox | the "didn't send" state points nowhere |
| **B7** | Link to Пробирная инспекция | the entry stays link-less |
| **B8** | Is `gold.by` yours, and on Cloudflare? | nowhere to deploy |
| **D1–D16** | decisions made on your behalf | they stand as built |

---

# Part 1. Blocking

## B1. Transcribe the current decree

**Status:** 🔴 blocks the main thing

`data/tariffs.json` is an empty array. That isn't an omission — the site knows
how to run that way and shows the "no verified figure yet" state. But the
figure is what it exists for.

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

**Answer:** _(unanswered)_

---

## B2. Check the counter-procedure text

**Status:** 🔴 blocks production

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

**Answer:** _(unanswered)_

---

## B3. Bullion: what to show

**Status:** 🔴 blocks the section

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

**Answer:** _(unanswered)_

---

## B4. Accounts and secrets

**Status:** 🔴 blocks deployment

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

**Answer:** _(unanswered)_

---

## B5. Rights to the photographs

**Status:** 🔴 blocks production

Your own HANDOFF flags it: three frames taken from the internet, rights
unverified, the scales shot especially (a crop of a catalogue photo). I didn't
touch them and can't verify them.

Either confirm the right to use them or reshoot. HANDOFF already has notes on
how to shoot them if it comes to that.

**Answer:** _(unanswered)_

---

## B6. The `pravka@gold.by` mailbox

**Status:** 🟡 small, but it breaks a form state

The address comes from the mockup. In the "didn't send" state the form offers
writing there directly — it's the last line of defence when everything else has
failed. No mailbox, no last line.

Different address? Tell me which and I'll change it in `src/lib/site.ts`.

**Answer:** _(unanswered)_

---

## B7. Link to Пробирная инспекция

**Status:** 🟡 the entry works without it

In the Sources block on `/o-proekte` the assay inspectorate is named but
carries **no link**: I never verified the URL of its page, and an unverified
link in a section called "Sources" is the same sin as an unverified figure.

Give me the address and I'll add it. Related: `nbrb.by` currently points at the
root — I didn't confirm a deep link to the prices page either.

**Answer:** _(unanswered)_

---

## B8. The domain

**Status:** 🔴 blocks deployment

`gold.by` is baked in as the canonical address (`astro.config.mjs`, via the
`SITE_URL` variable). Questions: is the domain yours? Is it on Cloudflare
(nameservers pointed at CF)? If not, what address goes in canonical and sitemap?

**Answer:** _(unanswered)_

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

**Answer:** _(unanswered)_

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
