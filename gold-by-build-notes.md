# gold.by — build notes

One page, one weekend. Russian language. Astro static site on Cloudflare Pages.

## What it is

A page that tells someone what their old gold is officially worth in Belarus, and what should happen when they take it in.

## The four facts that shape it

1. **The buyback price is set by the Ministry of Finance, not by shops.** Every licensed buyer pays the same. So this is not a price-comparison site — it's a "here is the official number" site.
2. **The price changes every few weeks, and each decree states its own end date.** At writing: постановление № 31 of 08.07.2026, in force from 18 July, stated through 31 July 2026. 585 gold = 202.18 BYN/g (down from 209.24). That expiry has almost certainly passed by the time you build this — get the current act from `minfin.gov.by/ru/activities_jewels/fund/pokupka/fizlic/`.
3. **A stamped hallmark is not the assayed purity.** The buyer determines purity and accepted metal mass; stones, clasps and non-precious parts come off the weight. This is the most useful thing the page can tell anyone, and the reason the calculator gives a tariff value rather than a promise.
4. **Trade-in and bullion are different regimes.** Some producers may lawfully pay above the tariff when you buy a new item from them. Certified ingots carry a surcharge (gold currently 5.5%, giving 364.61 BYN/g) and banks price ingots and coins separately. Don't run any of these through the scrap calculator.

## Build

**One page, four blocks:**

1. **The number.** Current official price per gram by purity, with the decree number and date visible next to it.
2. **Calculator.** Grams × purity → tariff value. Label the output "стоимость по официальным ценам Минфина" — not "сколько вы получите." Beside the input, one short note: hallmark ≠ assayed purity, and gross weight ≠ accepted metal mass.
3. **What happens at the counter.** Short. Operations in your presence, scales where you can see them, removable non-precious parts returned and the item reweighed, correction agreed with you if they can't be removed, get documentation. Precision: gold 0.01 g, silver 0.1 g. Verify against the published instruction before writing it.
4. **Not your case?** Three short paragraphs routing out: trade-in against a new purchase may be higher — ask the seller; certified ingots and coins follow a different route; a pawn loan isn't a sale and this doesn't apply. No calculator for any of them.

Plus a small footer page: where the numbers come from, who runs it, how to report an error.

## The one rule that matters

**The calculator goes quiet rather than lying.**

Store the price in a JSON file in the repo with the decree number, effective date, and stated expiry if it has one (some acts have none — don't invent one). Then:

- Past the stated expiry with nothing new transcribed → hide the number, show the last known value as history, disable the calculator, link to Minfin.
- No expiry stated → fine, keep serving until you replace it.

Add a scheduled Cloudflare Worker that fetches the Minfin page daily and emails you if the decree number changes. That's the whole monitoring requirement. It tells you to go look; you transcribe by hand from the act itself, not from news coverage.

## Don't

- Hardcode a price anywhere outside that JSON file
- Show a number without the decree and date next to it
- Invent a deduction percentage — describe the procedure instead
- Say or imply any buyer pays more than another for ordinary cash buyback
- Forecast anything
- Name a shop as dishonest
- Scrape anyone

## Setup

Google Search Console and Yandex Webmaster, sitemap to both. GA4 with a consent notice. Self-hosted Cyrillic font. Mobile-first at 360px — most visitors are on a phone.

## Later, only if it gets traffic

Buyer directory by city, bullion prices, a page per purity, posts when the price changes. All of it optional. None of it now.
