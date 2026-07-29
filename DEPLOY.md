# Развёртывание

Ничего из этого не выполнено: нет ни аккаунта Cloudflare, ни Resend, ни ключей.
Всё собрано и проверено локально, все секреты читаются из окружения.
**Ни одного ключа в репозитории нет, и ни один не подставлен «чтобы заработало».**

---

## Что нужно завести

| сервис | зачем | план |
|---|---|---|
| Cloudflare Workers | сайт, `/api/contact`, cron-проверки | бесплатный хватает |
| Cloudflare Turnstile | защита формы | бесплатный |
| Resend | письма с сообщениями об ошибках | бесплатный, 100 писем/сутки |
| GitHub | PR с новым постановлением (шаг 9) | — |

Домен `gold.by` должен быть в Cloudflare (nameservers на CF).

---

## Секреты

Кладутся через `wrangler secret put ИМЯ` — **не** в `wrangler.toml`,
не в `.env`, не в репозиторий.

| имя | что это | где взять |
|---|---|---|
| `TURNSTILE_SECRET_KEY` | секретный ключ Turnstile | Cloudflare → Turnstile → виджет → Settings |
| `RESEND_API_KEY` | ключ API Resend | Resend → API Keys → Create (права: Sending access) |
| `REPORT_TO_EMAIL` | куда приходят сообщения | ваш почтовый ящик |
| `REPORT_FROM_EMAIL` | от кого уходят письма | адрес на подтверждённом в Resend домене, например `robot@gold.by` |
| `RATE_LIMIT_SALT` | соль для хеширования адресов | `openssl rand -hex 32`, один раз |
| `GITHUB_TOKEN` | открыть PR с новым постановлением | GitHub → Fine-grained token, права `contents:write`, `pull_requests:write`, `issues:write` на один этот репозиторий |
| `GITHUB_REPO` | `владелец/имя-репозитория` | не секрет, но проще положить рядом |

```sh
wrangler secret put TURNSTILE_SECRET_KEY
wrangler secret put RESEND_API_KEY
wrangler secret put REPORT_TO_EMAIL
wrangler secret put REPORT_FROM_EMAIL
wrangler secret put RATE_LIMIT_SALT
wrangler secret put GITHUB_TOKEN
wrangler secret put GITHUB_REPO
```

### Публичный ключ Turnstile

`PUBLIC_TURNSTILE_SITE_KEY` — не секрет, он уезжает в разметку. Задаётся
переменной окружения **на сборке**:

```sh
PUBLIC_TURNSTILE_SITE_KEY=0x4AAA... npm run build
```

Не задан — виджет не рисуется. В продакшене (`ENVIRONMENT=production`) воркер
такую отправку не примет: форма покажет «не отправилось» и почту для прямого
письма. Это осознанно — лучше видимо не работать, чем принимать спам.

---

## KV

```sh
wrangler kv namespace create REPORTS
wrangler kv namespace create RATE_LIMIT
```

Полученные `id` вписать в `wrangler.toml` (сейчас там пустые строки,
поэтому `wrangler deploy` упадёт — так и задумано).

**Что в них лежит.** Ни писем, ни адресов, ни IP в открытом виде:

| ключ | значение | TTL |
|---|---|---|
| `rl:<sha256(соль+ip)>` | число запросов за окно | 1 час |
| `act:<номер акта>` | `{count, since}` — сколько обращений и с какой даты | 30 суток |
| `status:last_check` | момент последней проверки источника | без TTL |
| `block:publish` | флаг «парсер сломался, ничего не публиковать» | без TTL |

---

## Resend

1. Подтвердить домен (DNS-записи SPF и DKIM появятся в панели Resend;
   добавить их в Cloudflare DNS).
2. Создать ключ API с правом отправки.
3. `REPORT_FROM_EMAIL` обязан быть на подтверждённом домене, иначе Resend
   отклонит письмо и форма покажет «не отправилось».

---

## Turnstile

Виджет создаётся в панели Cloudflare. Режим — **Managed**: он в большинстве
случаев ничего не спрашивает у человека и выглядит как тонкая полоска.

> В HANDOFF просили обойтись без капчи: «капча ломает тон страницы».
> Возражение справедливое, поэтому режим Managed, а не Interactive.
> Само требование проверки — из ночного задания. Отказаться совсем:
> убрать вызов `verifyTurnstile` из `worker/src/contact.ts` и виджет
> из `src/components/ReportForm.astro`; honeypot и лимит частоты останутся.

---

## Развернуть

```sh
npm ci
npm run check          # типы, тесты, сборка
npm run build          # dist/ — его раздаёт воркер
wrangler deploy
```

Домен и маршрут привязываются в панели Cloudflare (Workers → Routes)
либо секцией `routes` в `wrangler.toml`.

---

## Проверить после развёртывания

- [ ] `/` открывается, состояние соответствует `data/tariffs.json`
- [ ] `/kak-proverit-otsenku` и `/o-proekte` открываются без `.html`
- [ ] Жёлто-чёрной плашки «Сборка на тестовых данных» **нет**
- [ ] Форма: неполная почта → своё сообщение об ошибке
- [ ] Форма: нормальное сообщение → письмо дошло, показан номер обращения
- [ ] Шесть сообщений подряд → шестое даёт 429
- [ ] `/sitemap.xml` и `/robots.txt` отдаются
- [ ] `GET /api/status` отвечает JSON
- [ ] Через час — cron отработал, `status:last_check` в KV обновился

---

## Чего делать нельзя

- Класть ключи в `wrangler.toml`, `.env` или коммит.
- Подставлять фиктивный ключ, чтобы «пока заработало».
- Заполнять `data/tariffs.json` цифрами не из самого акта.
- Давать cron-воркеру право публиковать цифры. Он открывает PR;
  цифру в продакшен пускает только человек, слив его руками.
