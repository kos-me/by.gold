# tests/fixtures/minfin/

HTML pages for the parser. **Hand-built. Every figure is invented.**

The structure — markup, table order, the merged "583 585" cell, the cell order
in the gold row — was taken from the live Minfin page
(`minfin.gov.by/ru/activities_jewels/fund/pokupka/fizlic/`, read on
29 July 2026). The numbers and act numbers were replaced with knowingly fake
ones: `TEST-*` act numbers, prices in single-digit BYN per gram.

The page's real HTML is **not committed**: it contains real prices, and
anything in a repository that looks like a price will eventually be taken for
data. The fidelity of these fixtures is in their structure, not their values.

Real HTML enters the repository in exactly one place: the worker attaches it
to its pull request as evidence of what it parsed, next to the record it
proposes. There it is an exhibit, not a data source.

The Russian text in these files is deliberate — it is what the parser matches
against.

## Cases

| file | what it covers | expected |
|---|---|---|
| `current.html` | an ordinary page, act `TEST-1` | parses |
| `changed.html` | a new act `TEST-2`, different prices | parses, act is new |
| `big-move.html` | act `TEST-3`, a price moved more than 15% | parses **with a warning**, not a refusal |
| `maintenance.html` | maintenance, HTTP 200, but no act and no table | refusal `no_act_line` |
| `archive.html` | the archive page: several acts in a row | refusal `multiple_acts` |
| `missing-fineness.html` | 583 absent from the table | parses with a warning |

The maintenance case answers 200, not 503 — that is the trap: by status code
alone it is indistinguishable from a healthy page.
