# What happens when the price changes

Plain words, no code. This is the document to read if you come back to the
project in six months and a new decree has appeared.

For the field-by-field format see [data/README.md](data/README.md). For secrets
and hosting see [DEPLOY.md](DEPLOY.md).

---

## The shape of the whole thing

The Ministry of Finance reissues the buyback prices every few weeks. Each time
it does, one act replaces another, and the site has to follow. Three facts
explain everything below:

1. **The site is static.** Pages are generated once, at build time, and served
   as files. Nothing is computed when a visitor arrives.
2. **Every figure lives in one file**, `data/tariffs.json`. There is no price
   anywhere in the code. Nothing reaches a page without passing through that
   file first.
3. **The state depends on today's date**, not only on the file. The same file
   produces a different page on 31 July and on 1 August.

Point 3 is the one that surprises people. Read "The rebuild is the part people
forget" below.

---

## The four states a page can be in

You never choose these. They follow from the records and the date.

| state | when | what a visitor sees |
|---|---|---|
| **A figure is shown** | an act is in force today | the big number, the table of finenesses, a working calculator |
| **The figure is withheld** | the last act's end date has passed and no successor has been added | no number, calculator off, an explanation, the lapsed figure kept as an archive |
| **Nothing yet** | the file is empty | no number, an explanation, a link to the source |
| **Not in force yet** | records exist but all start in the future | no number, and the date the next one starts |

**The withheld state is not a bug.** It was built first, before the working
one, and it is the whole reason the project exists: a lapsed price that looks
current is worse than no price. If you ever find yourself editing code to make
a figure appear, stop — that is the failure mode this design is defending
against.

---

## Adding a new act

You need the act itself, not a news story about it. The prices page links the
current act as a PDF.

1. Find the act. Start at
   <https://minfin.gov.by/ru/activities_jewels/fund/pokupka/fizlic/> — the
   current prices, the appendix heading with the act's number and date, and a
   PDF link to the act.
2. Read four things out of it:
   - the **act number** and the **date it was signed** — from the appendix
     heading (`08.07.2026 № 31`);
   - the **date it takes force** — sometimes stated outright ("вступает в силу
     1 августа 2026 г."), sometimes deferred to publication, in which case the
     prices page states the date above the table;
   - the **date it stops applying**, from a "действует по …" clause — and if
     the act has no such clause, that is `null`. Not a guess, not a month
     later. `null`;
   - the **prices**, from Table 1 of the appendix.
3. Add a record to `data/tariffs.json`. Copy the shape from the record already
   there. Watch for the merged cell: 583 and 585 usually share one number, so
   eight numbers cover nine finenesses.
4. Run `npm run check`. An invalid record fails the build with a list of
   specific complaints — a missing source link, an expiry before the start
   date, an unknown fineness. It will not let you ship a malformed record.
5. Commit and push. Deployment rebuilds.

You do not delete the old record. History is built from the records that
accumulate, and the state machine works out which one applies today.

### Two kinds of record

Most records are read from the act. A few are read from the Ministry's year
archive instead, and are marked `"transcribed_from": "archive"`.

The difference matters. The archive pages publish an act's number, date, start
date and prices, but not its text — so whether it named an end date is unknown.
Those records are **history only**: the code will not let one become the price
shown as current, however recent it looks. Full explanation in
[data/README.md](data/README.md).

The practical consequence: **importing history cannot change the price on the
homepage.** If it ever appears to, something is wrong.

If you later read the act for one of these, upgrade the record — drop
`transcribed_from`, fill in the real expiry, point `source_url` at the act. What
the act says always beats what a summary page says.

### Things that will be rejected, on purpose

- A record with no `source_url`, no act number, or no effective date.
- `stated_expiry` missing entirely. Absent and `null` are different: `null` is
  a statement that the act names no end date, and you have to make it.
- A price of `0` as a placeholder, or an act number like `TEST-1`.
- Anything with a fixture marker in it. A test guards `data/` for exactly this.

### If you are unsure about a date

Leave the act out. A day late is recoverable; a wrong date published as fact
is not. The site withholds the figure in the meantime and explains why, which
is an honest thing for it to do.

Note that Ministry pages can disagree with each other. Act № 31 is dated from
17 July on the archive page and from 18 July on the page that carried it while
it was in force. When that happens, record the conflict in the record's `notes`
rather than quietly picking one.

---

## The rebuild is the part people forget

The site is static, so a page is a snapshot of what was true when it was built.
Two things change the truth without anybody pushing a commit:

- an act's end date passing, which should withhold the figure;
- a future-dated act's start date arriving, which should show a new figure.

Rebuild-on-push crosses neither. A build made in July keeps serving July's
answer until something triggers a new build.

### The question this always raises

*"If both acts are already in `data/tariffs.json` — the one expiring on 31 July
and the one starting on 1 August — will the new price appear on its own?"*

**No.** A rebuild is required, and here is the concrete reason: **the successor's
price is not in the file being served.** A build made in July contains act № 31's
figures and nothing else. Act № 34's price, its number and its date do not appear
anywhere in that HTML, so no amount of client-side script could show them. There
is nothing to show.

Verified in a real browser, driving one July build with the clock faked
(`node scripts/clock.mjs`):

| the browser thinks it is | what a visitor sees |
|---|---|
| 29 July | 202,18 · calculator working |
| 31 July | 202,18 · calculator working |
| **1 August** | **no figure** · "срок постановления истёк" · table dashed · calculator off |
| 15 September | the same, indefinitely |

So the failure is not a wrong price — it is **no price at all**, on a day when a
correct one exists in the repository and is simply unreachable. Rebuild and the
same data renders act № 34 at 202,50.

There are two defences, and they do different jobs:

- **A daily rebuild**, which is the actual fix. Set up a scheduled deploy —
  see DEPLOY.md. Without it the handover simply does not happen.
- **The browser guard** (`src/scripts/staleness.ts`), which is the safety net.
  Every visitor's browser re-checks the expiry date and, if it has passed,
  takes the figure off the page and switches the calculator off. It can only
  remove a figure, never add one, so it can fail towards silence but never
  towards a wrong number.

The guard means a forgotten rebuild goes quiet instead of lying. It does not
mean you can skip the rebuild: quiet is still wrong when a valid successor is
sitting in `data/tariffs.json` unable to reach the page.

---

## What the cron worker does, and what it deliberately cannot do

Once deployed, a scheduled worker checks the Ministry page and compares it to
what the site is serving.

It can: notice that the page has changed, record when it last looked, and open
a **pull request** with a draft record.

It cannot: publish a figure. The draft it opens is deliberately invalid — the
dates are left empty and `transcribed_by` says `FILL IN` — so the build fails
until a person opens the act and completes it. That is not a limitation to be
engineered away. It is the point. A machine can tell you the page changed; only
a person can confirm what the act says.

---

## Reading the record's own notes

Each record carries a `notes` field with its provenance: which field came from
where, what was cross-checked against what, and anything that did not line up.
It is written for whoever inherits this. When you add a record, write yours the
same way — especially the parts you were unsure about.

`transcribed_by` names whoever read the act. It is provenance, never shown to
visitors, and the schema refuses a record without it.
