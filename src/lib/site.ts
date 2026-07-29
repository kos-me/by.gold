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

/** Address for reports of an error in a figure. */
export const CONTACT_EMAIL = 'pravka@gold.by';

export interface NavItem {
  readonly href: string;
  readonly label: string;
}

export const NAV: readonly NavItem[] = [
  { href: '/', label: 'Цена' },
  { href: '/kak-proverit-otsenku', label: 'Как проверить' },
  { href: '/o-proekte', label: 'О проекте' },
];
