# tests/fixtures/

Test data. **Every figure here is knowingly fake** and must stay that way: act
numbers like `TEST-1`, prices of `1.00`, `2.00` and so on.

The point is that a fixture must be impossible to mistake for a real record if
it ever ends up somewhere it shouldn't. A plausible number in a test is a
number waiting to migrate into `data/` and become "a price".

`tests/data-integrity.test.ts` guards both sides of that boundary:

- nothing in `data/` may carry the marks of a fixture;
- fixtures may not look plausible (prices above 10 BYN per gram are banned
  here — real gold prices are orders of magnitude higher).

## What lives where

| path | purpose |
|---|---|
| `valid-state/` | a data directory for previewing the homepage in its working state. Supplied through `GOLD_DATA_DIR`. |
| `expired-state/` | the same, for the "expired, no successor" state. |
| `minfin/` | Minfin HTML pages for the parser. |
