# Журнал сборки

Ночная автономная сборка. Каждый шаг — из плана в брифе. Решения, принятые
без возможности спросить, помечены **Решение**; возражения — **Возражение**.

---

## Шаг 1 — каркас Astro + TypeScript strict

**Сделано**

- `mise.toml` + `.node-version` фиксируют Node 24.15.0.
- Astro 7.1.5, шаблон `minimal`, `output: 'static'`.
- `tsconfig.json` — `astro/tsconfigs/strict` плюс `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noUnusedLocals/Parameters`,
  `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`.
- Vitest 4 как тест-раннер (`tests/**/*.test.ts`).
- `data/tariffs.json` и `data/bullion.json` созданы **пустыми массивами** —
  как велено в брифе. Ни одной цифры в репозитории нет.
- `npm run build` и `npm run typecheck` зелёные.

**Окружение**

Node в системе есть, но через `mise` и без глобальной версии — `node` не был
в `PATH`. Глобальный конфиг пользователя не трогал: вместо `mise use -g`
положил `mise.toml` в проект. Это же чинит запуск и для CI.

**Решение** — `build.format: 'file'`. Astro по умолчанию кладёт
`kak-proverit-otsenku/index.html`; при `trailingSlash: 'never'` это даёт
редирект на каждый переход. `'file'` отдаёт `kak-proverit-otsenku.html`,
Cloudflare Pages раздаёт его по адресу без расширения напрямую.

**Решение** — `inlineStylesheets: 'always'`. Бюджет 150 КБ без шрифтов,
CSS на сайте немного; отдельный запрос за стилями дороже, чем его инлайн.

**Решение** — `handoff/` остаётся в репозитории как исходник дизайна, но
исключён из `tsconfig` (иначе `astro check` ругается на `support.js`
из макета — это рантайм превью, не наш код).
