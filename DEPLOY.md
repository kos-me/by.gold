# Deployment

None of this has been done: there is no Cloudflare account, no Resend account
and no keys. Everything was built and tested locally, and every secret is read
from the environment. **There is no key in the repository, and not one was
substituted to make something "work".**

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

Put the resulting ids into `wrangler.toml` (they are empty strings there now,
so `wrangler deploy` fails — by design).

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
