/**
 * Site-wide constants: addresses, navigation, source labels.
 *
 * No figures here, and none may be added — prices live only in `data/`.
 *
 * Note on language: user-facing strings stay Russian throughout the codebase,
 * because the site is Russian. Comments and identifiers are English.
 */

export const SITE_NAME = 'gold.by';

export const SITE_TAGLINE = 'цена скупки золота, установленная Минфином';

/** Minfin's page on buyback prices from individuals. Source of the headline figure. */
export const MINFIN_URL = 'https://minfin.gov.by/ru/activities_jewels/fund/pokupka/fizlic/';

/** National Bank — bullion prices. Different regime, different source. */
export const NBRB_URL = 'https://www.nbrb.by/';

/** State assay supervision, a division of the Ministry of Finance. Confirmed 29.07.2026. */
export const PROBIRKA_URL = 'https://www.minfin.gov.by/ru/activities_jewels/probirka/';

/**
 * The Council of Ministers resolution governing what happens at the counter:
 * № 1211 of 12.09.2011, National Register 5/34430. The procedure text on
 * /kak-proverit-otsenku is reconciled against it — see src/lib/procedure.ts.
 */
export const BUYBACK_RULES_URL = 'https://pravo.by/document/?guid=3961&p0=C21101211&p1=1';

/*
 * No contact email is published on the site, deliberately: the form is the
 * only channel. Where reports actually land is the worker's REPORT_TO_EMAIL
 * secret, which never reaches the browser.
 */

export interface NavItem {
  readonly href: string;
  readonly label: string;
}

export const NAV: readonly NavItem[] = [
  { href: '/', label: 'Цена' },
  { href: '/kak-proverit-otsenku', label: 'Как проверить' },
  { href: '/o-proekte', label: 'О проекте' },
];
