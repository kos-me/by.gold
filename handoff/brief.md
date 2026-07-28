# gold.by — design brief

## Subject

A Russian-language Belarusian site that tells someone what their old gold is officially worth, and what should happen when they take it to a buyback counter.

The central fact: in Belarus the buyback price is **set by the Ministry of Finance**, not by shops. Every licensed buyer pays the same. So this isn't a comparison site or a marketplace — it's a single authoritative number, published by the state, changing every few weeks.

## Audience

An adult in Minsk or a regional city holding an inherited chain, a ring from a divorce, a broken earring. They want a number and they want to know they won't be shortchanged. Not jewelry shoppers. Not investors. Usually on a mid-range Android phone, often standing in a kitchen with the item in their other hand.

They are mildly anxious. Selling gold is something people do when they need money, and they suspect the counter will cheat them. The design's emotional job is to make an official figure feel knowable and to make the visitor feel competent walking in.

## The page's single job

Turn *"I have some old gold"* into *"the official price is X, my item is roughly Y, and here's what should happen at the counter."*

## Direction (decided — don't re-litigate)

- **Modern utility.** Clean, app-like, friendly. Not institutional, not editorial. It should feel like a well-made tool, not a government portal and not a magazine.
- **Simple wordmark.** Type-based, no elaborate logo system.
- **Photography** — gold, jeweler's scales, hallmark stamps and punches. Real materials.

Everything below is guidance within those three decisions.

## Structure

**`/` — five blocks, in order:**

1. **The number.** Current official price per gram by purity, with the decree number and date beside it.
2. **Calculator.** Grams × purity → tariff value. A short note beside the input: a stamped hallmark isn't the assayed purity, and gross weight isn't accepted metal mass.
3. **History.** Past tariffs. Small — a sparkline or compact table, not a dashboard.
4. **Bullion.** NBRB ingot prices. Clearly a different regime from scrap.
5. **Not your case?** Three short routes out: trade-in against a new purchase may be higher; certified ingots and coins follow another route; a pawn loan isn't a sale.

**`/kak-proverit-otsenku`** — the counter procedure. Text-led.

**`/o-proekte`** — sources, who runs it, contact form, error reporting.

## The design problem that matters most

**The disabled state.**

Each Minfin decree carries a stated end date. When it passes and no successor has been published to the site, the calculator switches off and the number is withheld rather than shown stale. That state will be live sometimes — possibly for days.

It has to read as **"this site is being careful"** and never as **"this site is broken or abandoned."** The visitor should come away trusting it *more* for refusing to guess.

This is the screen where the whole proposition is visible, so design it as a first-class state rather than an error style. It needs: what's known, what isn't, why the number is withheld, a link to the official source, and the last known figure clearly marked as history rather than as an answer.

Design both: the normal state and the withheld state.

## Photography notes

The subject's real materials are **steel scales, ink and punch stamps, loupes, worn metal, paper receipts, the inside of a ring band where the 585 is struck.** Not bullion bars glinting on black. Not stock images of jewelry as luxury. The visitor is selling, not buying — aspirational jewelry photography sets exactly the wrong tone and implies a market that doesn't exist here.

Close, tactile, slightly imperfect. A hallmark under magnification is more on-subject than any amount of gold.

## Constraints

- **All copy in Russian**, sentence case, plain verbs.
- **Cyrillic-first typography.** Display and body faces must have real Cyrillic coverage with properly drawn к, ж, д, б, я — not a Latin face with bolted-on Cyrillic. Verify before committing to a face. Self-hosted, subset.
- **360px first.** Design mobile, then widen. Tables must degrade to something readable rather than scrolling sideways.
- Performance budget is tight: LCP under 2s on 4G, under 150KB excluding fonts. Photography has to earn its weight — few images, well compressed.
- Visible keyboard focus, reduced motion respected.

## Deliberately avoid

- Cream-and-terracotta with a high-contrast serif; near-black with one acid accent; broadsheet hairline rules at zero radius. All three are current defaults rather than choices.
- The literal move: gold gradients, foil textures, shine. The subject's materials are steel and ink, not glitter.
- Comparison-site visual language — "best rate" badges, sorting affordances, a highlighted winner row. The price is identical everywhere; that vocabulary would be a lie.
- Anything implying the visitor can sell online. They can't; it's a legal question, not a feature gap.
- Dashboard framing. One number, one calculation, not a data product.

## Signature element

One memorable thing, earned from the subject rather than applied to it. The strongest candidate is the **hallmark punch** — a struck, slightly uneven mark used as the site's sign of verified data, appearing beside every figure that carries a decree number and date.

It fits because the site's actual product is *this number is official and here's the proof*, which is precisely what a hallmark is: a struck mark attesting to verified purity. Decide for yourself and justify the choice, but that's the thread worth pulling.

## Copy notes

The calculator output must read as **"стоимость по официальным ценам Минфина"** — the official tariff value for the mass and purity entered. Never "сколько вы получите" or anything phrased as a promise. The final sum depends on the buyer's assay, and the design shouldn't paper over that gap; the honesty is the differentiator.

Withheld-state copy explains what changed and what's being confirmed. No apology, no vagueness, no mood — say what happened and link to the source.
