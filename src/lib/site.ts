/**
 * Константы сайта: адреса, навигация, подписи источников.
 *
 * Цифр здесь нет и быть не может — они живут только в `data/`.
 */

export const SITE_NAME = 'gold.by';

export const SITE_TAGLINE = 'цена скупки золота, установленная Минфином';

/** Страница Минфина о ценах скупки у физических лиц. Источник главной цифры. */
export const MINFIN_URL = 'https://minfin.gov.by/ru/activities_jewels/fund/pokupka/fizlic/';

/** Национальный банк — цены на мерные слитки. Другой регламент, другой источник. */
export const NBRB_URL = 'https://www.nbrb.by/';

/** Адрес для сообщений об ошибке в цифре. */
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
