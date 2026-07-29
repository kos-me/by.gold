# Deployment

None of this has been done: there is no Cloudflare account, no Resend account
and no keys. Everything was built and tested locally, and every secret is read
from the environment. **There is no key in the repository, and not one was
substituted to make something "work".**

---

## Working safely in a shared Cloudflare account

The account this deploys into (`onestar`, id `4afc3083…cc33`) holds other
domains. Nothing here may put them at risk. A read-only audit on 30 July 2026,
before anything was created:

| checked | result |
|---|---|
| a Worker already named `gold-by` | **none** — `deployments list` returns "This Worker does not exist" |
| existing KV namespaces | **none** — `kv namespace list` returns `[]` |
| routes or custom domains in `wrangler.toml` | **none configured** |
| `wrangler deploy --dry-run` | valid; 22 assets, 58.6 KiB; bindings `ASSETS` and `ENVIRONMENT` only |

So the first deploy creates a new Worker and cannot overwrite one, and the KV
namespaces are additive.

### The rules that keep it that way

- **Never add a wildcard route.** `wrangler.toml` deliberately defines no
  `routes`, so a deploy publishes only to a `workers.dev` URL and touches no
  zone. When the time comes, attach `gold.by` as a **Custom Domain** on the
  Worker — that writes a record in the `gold.by` zone and nowhere else. A route
  pattern such as `*/*` or `*.by/*` would capture traffic for other domains in
  the account. Never write one.
- **Always deploy with `--env=""`.** `wrangler.toml` also defines
  `[env.staging]`, and without the flag wrangler warns that no target was
  chosen. Be explicit.
- **Don't reuse your interactive login for CI.** The OAuth token wrangler
  created on your machine carries write access to Workers, KV, D1, Pages,
  Queues, email sending, containers and more, across the whole account. A CI
  token must be a *new* token with only **Workers Scripts: Edit** (plus Account
  Settings: Read), and nothing else.
- **Note what even that cannot be narrowed to.** A Workers Scripts token is
  account-scoped: Cloudflare has no per-Worker API token, so if it leaked it
  could edit any Worker in the account. A **deploy hook** (Option B below) can
  only trigger a build of *one* Worker, which is a materially smaller blast
  radius. In a shared account that is a real argument for Option B over storing
  an API token in GitHub.
- **Deleting is the dangerous verb.** Nothing in this document asks you to run
  `wrangler delete`, `kv namespace delete`, or anything with `--force`. If a
  command ever suggests removing something you did not just create, stop.

---

## Accounts needed

| service | what for | plan |
|---|---|---|
| Cloudflare Workers | the site, `/api/contact`, the cron checks | free tier is enough |
| Cloudflare Turnstile | form protection | free |
| Resend | emails carrying error reports | free, 100 messages/day |
| GitHub | pull requests carrying a new decree | — |

The `gold.by` domain has to sit on Cloudflare (nameservers pointed at CF).

---

## Secrets

Set through `wrangler secret put NAME` — **not** in `wrangler.toml`, not in a
`.env`, not in a commit.

| name | what it is | where to get it |
|---|---|---|
| `TURNSTILE_SECRET_KEY` | Turnstile secret key | Cloudflare → Turnstile → widget → Settings |
| `RESEND_API_KEY` | Resend API key | Resend → API Keys → Create (Sending access) |
| `REPORT_TO_EMAIL` | where reports arrive | your mailbox |
| `REPORT_FROM_EMAIL` | sender | an address on a domain verified in Resend, e.g. `robot@gold.by` |
| `RATE_LIMIT_SALT` | salt for hashing addresses | `openssl rand -hex 32`, once |
| `GITHUB_TOKEN` | open the PR with a new decree | GitHub → fine-grained token with `contents:write`, `pull_requests:write`, `issues:write` on this repository only |
| `GITHUB_REPO` | `owner/repository` | not a secret, but simpler to keep alongside |

```sh
wrangler secret put TURNSTILE_SECRET_KEY
wrangler secret put RESEND_API_KEY
wrangler secret put REPORT_TO_EMAIL
wrangler secret put REPORT_FROM_EMAIL
wrangler secret put RATE_LIMIT_SALT
wrangler secret put GITHUB_TOKEN
wrangler secret put GITHUB_REPO
```

### The Turnstile public key

`PUBLIC_TURNSTILE_SITE_KEY` is not a secret — it ships in the markup. It is set
as an environment variable **at build time**:

```sh
PUBLIC_TURNSTILE_SITE_KEY=0x4AAA... npm run build
```

Unset, no widget renders. In production (`ENVIRONMENT=production`) the worker
will refuse such a submission: the form shows "didn't send" and offers a direct
email address. That is deliberate — visibly not working beats accepting spam.

---

## KV

```sh
wrangler kv namespace create REPORTS
wrangler kv namespace create RATE_LIMIT
```

The two `[[kv_namespaces]]` blocks in `wrangler.toml` are **commented out**.
Uncomment them and paste in the ids these commands print.

They used to carry `id = ""` so that `wrangler deploy` would fail rather than
deploy something half-configured. That was too blunt: an invalid id fails every
wrangler command that reads the file — including `wrangler login` and
`wrangler kv namespace create`, so it blocked the very setup it was guarding.

The guarantee moved into the worker instead, where it belongs: **in production
the form returns 503 and tells the visitor it is not working if the `RATE_LIMIT`
binding is missing.** It no longer quietly accepts an unlimited number of
submissions. Two tests hold that, one for production and one confirming local
development still works without KV.

**What they hold.** No messages, no addresses, no IPs in the clear:

| key | value | TTL |
|---|---|---|
| `rl:<sha256(salt+ip)>` | request count in the window | 1 hour |
| `act:<decree number>` | `{count, since}` — how many reports and from when | 30 days |
| `status:last_check` | instant of the last source check | none |
| `block:publish` | "the parser broke, propose nothing" flag | none |

---

## Resend

1. Verify the domain (Resend shows the SPF and DKIM records; add them in
   Cloudflare DNS).
2. Create an API key with sending rights.
3. `REPORT_FROM_EMAIL` must be on the verified domain, or Resend rejects the
   message and the form shows "didn't send".

---

## Turnstile

Create the widget in the Cloudflare dashboard. Use **Managed** mode: it asks
the visitor nothing in most cases and renders as a thin strip.

> HANDOFF asked for no captcha: "a captcha breaks the page's tone". That is a
> fair objection, hence Managed rather than Interactive. The requirement to
> verify came from the overnight brief. To drop it entirely: remove the
> `verifyTurnstile` call from `worker/src/contact.ts` and the widget from
> `src/components/ReportForm.astro`; the honeypot and rate limit stay.
> See also QUESTIONS.md, D4.

---

## Deploy

```sh
npm ci
npm run check          # types, tests, build
npm run build          # dist/ — the worker serves it
wrangler deploy
```

Bind the domain and route in the Cloudflare dashboard (Workers → Routes) or via
a `routes` section in `wrangler.toml`.

---

## The site must rebuild on a schedule, not only on a push

This matters and is easy to miss. The site is static, so its state is decided
at build time — but the state depends on **today's date**, not only on the
contents of `data/`. Two boundaries move it with nothing being pushed:

- an act's `stated_expiry` passing, which withholds the figure;
- a future-dated act's `effective_from` arriving, which is what should happen
  on **1 August 2026** for act № 34.

Rebuild-on-push alone will not cross either. A build made before the boundary
keeps serving its old state until someone commits something.

The failure is not silent, and it fails in the safe direction: the browser
re-checks the expiry on every visit and takes the figure away client-side
(`src/scripts/staleness.ts`). So a stale build goes quiet rather than quoting
a lapsed price. But quiet is not correct when a valid successor is already
sitting in `data/tariffs.json` — it just cannot reach the page without a
rebuild.

### How, concretely

This site is **not** Cloudflare Pages — `wrangler.toml` serves `./dist` through
a Worker's `[assets]` binding.

There are two ways to do it, and both work. What follows is committed and ready;
the alternative is described afterwards and is arguably the better long-term
answer.

### Option A — GitHub Actions (committed, ready to use)

A new build means running `npm run build && wrangler deploy`, which needs a
machine. That machine is **GitHub Actions**, and the workflow is committed:
[`.github/workflows/daily-rebuild.yml`](.github/workflows/daily-rebuild.yml).
It checks out main, runs `npm run check`, builds, prints which act it just
published, and deploys. It runs twice a day and has a manual button.

To turn it on, add these in the repository's settings — **Settings → Secrets and
variables → Actions**:

| kind | name | where to get it |
|---|---|---|
| secret | `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → Create, template "Edit Cloudflare Workers", scoped to this account |
| secret | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Workers → Account ID |
| variable | `PUBLIC_TURNSTILE_SITE_KEY` | Turnstile widget → Site Key. Not secret: it ships in the HTML |
| variable | `PUBLIC_GA4_ID` | GA4 → data stream. Optional |
| variable | `PUBLIC_GOOGLE_SITE_VERIFICATION` | Search Console. Optional |
| variable | `PUBLIC_YANDEX_VERIFICATION` | Yandex Webmaster. Optional |

The four `PUBLIC_*` go in **Variables**, not Secrets. They are not secret —
they are in the page source — and a masked value in the build log is a nuisance
rather than protection.

Nothing else is needed: `wrangler secret put` values already live in Cloudflare
and are not part of a build.

### Two things to know about GitHub's scheduler

- **In a public repository it stops after 60 days of inactivity.** GitHub:
  "In a public repository, scheduled workflows are automatically disabled when no
  repository activity has occurred in 60 days." It applies to public
  repositories only — so while this repository is private it does not bite, and
  the day you open-source it, it does. A repository nobody pushes to for two
  months stops rebuilding, which here means it stops crossing date boundaries.
- **Schedules are best-effort.** GitHub: the schedule event "can be delayed
  during periods of high loads", "high load times include the start of every
  hour", and "some queued jobs may be dropped". Hence two runs a day, both
  deliberately away from the top of the hour: 00:23 Minsk so an act taking force
  today is live immediately, and 09:47 as a safety net.

### Option B — Workers Builds and a deploy hook

Cloudflare added **Deploy Hooks for Workers Builds** in April 2026: a unique URL
that starts a build when you POST to it. Connect the repository under
Workers & Pages → your Worker → Settings → Builds, set the build command to
`npm run check && npm run build`, and create a deploy hook.

Then the scheduler can be **this project's own cron Worker**, which already runs
hourly — one `fetch()` to the hook URL, kept as a secret like any other
credential. That is appealing for three reasons: it removes GitHub from the
deployment path entirely, Cloudflare's cron triggers are more dependable than
GitHub's best-effort scheduler, and there is no 60-day dormancy rule.

It is not wired up, because it cannot be tested without a Cloudflare account. If
you take this route, the deploy hook URL is a credential — anyone holding it can
trigger builds — so it goes in via `wrangler secret put`, never into
`wrangler.toml` or a commit.

Whichever you choose, the requirement is the same: **something must trigger a
build daily.** Do not run both, or you will deploy twice for no reason.

### What it deliberately does not do

The scheduled run **publishes nothing new**. It rebuilds the commit already on
main, so the only thing that changes is the date the pages were rendered for. A
figure still enters only one way: a person merging a pull request that adds a
record to `data/tariffs.json`.

It also refuses to deploy a build that fails `npm run check`, so an unattended
run cannot push out something broken.

### If you would rather CI owned deploys entirely

Add `push: branches: [main]` to the workflow's `on:` block and it becomes your
deploy path as well, replacing the manual `wrangler deploy` below. That is one
line, and it is left out on purpose: nothing should start deploying on your
behalf until you have deployed by hand once and seen it work.

---

## The workers.dev subdomain: required to exist, not used

Learned on the first real deploy, 30 July 2026. The Worker and its assets
upload fine, but attaching the cron triggers fails with **403, code 10063**:
"You need a workers.dev subdomain in order to proceed."

Cloudflare requires the *account* to have a workers.dev subdomain registered
before cron triggers can be attached to any Worker in it — even a Worker with
`workers_dev = false` that will never be served there. The two settings are
independent: the subdomain is an account-level name that must exist; whether a
given Worker publishes to it is per-Worker, and ours does not.

So the sequence is:

1. The account owner registers the subdomain once, in the dashboard
   (Workers & Pages — it prompts on first visit). **The owner picks the name**,
   not this project: it names every Worker in the account.
2. `wrangler deploy --env=""` again. The triggers then attach.
3. Verify the site is still not being served from
   `gold-by.<subdomain>.workers.dev` — `workers_dev = false` is what keeps it
   that way, and the dashboard alone is not enough: disabling it there without
   the config line gets re-enabled on the next deploy.

## Post-deploy checklist

- [ ] `/` loads and its state matches `data/tariffs.json`
- [ ] `/kak-proverit-otsenku` and `/o-proekte` load without `.html`
- [ ] The yellow-and-black "fixture build" banner is **absent**
- [ ] Form: an incomplete email gives our own error message
- [ ] Form: a normal report arrives by email and shows a ticket number
- [ ] Six reports in a row: the sixth returns 429
- [ ] `/sitemap.xml` and `/robots.txt` are served
- [ ] `GET /api/status` returns JSON
- [ ] An hour later: cron has run and `status:last_check` in KV has moved

---

## Never

- Put keys in `wrangler.toml`, a `.env`, or a commit.
- Substitute a dummy key so something "works for now".
- Fill `data/tariffs.json` with figures from anywhere but the act itself.
- Give the cron worker permission to publish figures. It opens a pull request;
  only a person merging it by hand puts a figure into production.
