/**
 * Copy that depends on the state of the data.
 *
 * Gathered in one module because "there is no figure" is not an error label
 * but a full screen with its own headline, explanation and calculator
 * caption. Scattered across components, these phrases would inevitably
 * drift apart.
 *
 * Tone rules from the brief: no apology, no warning icons, no "oops". What
 * is known, what is being confirmed, a link to the source. And under no
 * circumstances a promise of a sum, a forecast or a "best price".
 *
 * Everything below is visitor-facing and therefore Russian.
 */

import { formatRuDate } from './date.ts';
import type { TariffReason, TariffState } from './tariff.ts';

export interface HeadCopy {
  readonly title: string;
  readonly lede: string;
}

/** Headline and standfirst for the homepage. */
export function headCopy(state: TariffState): HeadCopy {
  switch (state.reason) {
    case 'in_force_until':
    case 'in_force_no_expiry':
      return {
        title: 'Официальная цена скупки золота в Беларуси',
        lede: 'Цену устанавливает Министерство финансов. Ниже неё не платит ни одна лицензированная скупка.',
      };

    case 'expired_no_successor': {
      const act = state.lastKnown;
      const until =
        act?.stated_expiry === undefined || act?.stated_expiry === null
          ? null
          : formatRuDate(act.stated_expiry);
      return {
        title: 'Цена не показана: срок действия постановления истёк',
        lede:
          act === null || until === null
            ? 'Срок действия последнего постановления истёк, новое ещё не опубликовано. Пока это так, мы не показываем цену и не считаем стоимость: старая цифра уже может быть неверной.'
            : `Постановление № ${act.act_number} действовало до ${until} года. Новое ещё не опубликовано, поэтому мы не показываем цену и не считаем стоимость — старая цифра уже может быть неверной.`,
      };
    }

    case 'not_yet_effective': {
      const next = state.upcoming;
      return {
        title: 'Цена не показана: новое постановление ещё не вступило в силу',
        lede:
          next === null
            ? 'Действующего постановления сейчас нет. Считать не по чему.'
            : `Постановление № ${next.act_number} вступает в силу ${formatRuDate(next.effective_from)} года. До этого дня считать по нему нельзя, а прежнего действующего акта у нас нет.`,
      };
    }

    case 'no_records':
      return {
        title: 'Цена не показана: проверенной цифры пока нет',
        lede: 'Цену скупки устанавливает Минфин. Мы показываем её только после того, как цифры перенесут из самого постановления вручную. Пока этого не сделано — ниже ссылка на источник.',
      };
  }
}

/** Short caption beside "Цифры пока нет" in the price block. */
export function absenceNote(state: TariffState): string {
  switch (state.reason) {
    case 'expired_no_successor':
      return 'ждём новое постановление';
    case 'not_yet_effective':
      return state.upcoming === null
        ? 'ждём вступления в силу'
        : `вступает в силу ${formatRuDate(state.upcoming.effective_from)}`;
    case 'no_records':
      return 'источник — сайт Минфина';
    case 'in_force_until':
    case 'in_force_no_expiry':
      return '';
  }
}

/** Right-hand panel column: what exactly is being confirmed. */
export function pendingCopy(state: TariffState, hasCheckLog: boolean): string {
  const cadence = hasCheckLog
    ? 'Проверяем сайт Минфина каждый час; страница обновится сама.'
    : 'Сверяем с сайтом Минфина. Цифры переносит человек из самого акта, поэтому обновление не мгновенное.';

  switch (state.reason) {
    case 'expired_no_successor':
      return `Номер, дату и цены нового постановления. ${cadence}`;
    case 'not_yet_effective':
      return `Дождёмся дня вступления в силу и покажем цифру. ${cadence}`;
    case 'no_records':
      return `Номер, дату и цены действующего постановления. ${cadence}`;
    case 'in_force_until':
    case 'in_force_no_expiry':
      return '';
  }
}

/** Left-hand panel column: what does not change whatever the figure is. */
export const KNOWN_COPY =
  'Порядок не менялся: цену устанавливает Минфин, и во всех лицензированных ' +
  'скупках она одинакова. Меняется только цифра.';

export interface CalcOutCopy {
  readonly label: string;
  readonly note: string;
}

/** Captions around the calculation result. */
export function calcOutCopy(state: TariffState): CalcOutCopy {
  if (state.status === 'valid') {
    return {
      // Exactly this wording, never "what you will get": the final sum
      // depends on the assay and the accepted mass, and that gap stays open.
      label: 'Стоимость по официальным ценам Минфина',
      note: 'Итоговая сумма зависит от пробы и зачётной массы, определённых при приёмке.',
    };
  }

  const note: Record<Exclude<TariffReason, 'in_force_until' | 'in_force_no_expiry'>, string> = {
    expired_no_successor:
      'Считать по истёкшему постановлению нельзя. Расчёт включится, как только выйдет новое.',
    not_yet_effective:
      'Постановление ещё не вступило в силу. Расчёт включится в первый день его действия.',
    no_records:
      'Считать не по чему: действующего постановления на сайте пока нет. Расчёт включится, когда цифры перенесут.',
  };

  return {
    label: 'Расчёт приостановлен',
    note: note[state.reason as keyof typeof note],
  };
}

/**
 * The trade-in callout.
 *
 * The wording deliberately departs from the mockup, which said "jewellery
 * chains sometimes pay above this price… under their own buyback programmes".
 * That asserts someone pays more than someone else for ordinary cash buyback,
 * which cannot be true: the tariff is identical everywhere. Above-tariff only
 * happens as a trade-in credit against a new purchase, and that is a different
 * transaction. Describe the mechanism; quote nobody's terms.
 */
export const TRADE_IN_LABEL = 'бывает иначе';

export const TRADE_IN_COPY =
  'Цена Минфина — то, что обязаны заплатить в любой лицензированной скупке: ' +
  'за наличные везде одинаково, ниже не платит никто. Отдельная сделка — ' +
  'зачёт старого изделия при покупке нового у производителя: это не скупка, ' +
  'и сумма зачёта считается по условиям продавца. Спрашивайте их до того, ' +
  'как сдавать лом: сданное обратно не возвращают.';

export const CALC_ASIDE_COPY =
  'Здесь посчитана скупка за наличные. Если вы меняете старое изделие на ' +
  'новое, это другая сделка и другой расчёт — уточняйте у продавца.';

/** The three "not your case" routes. */
export const ROUTES: readonly { readonly title: string; readonly text: string }[] = [
  {
    title: 'Обмен на новое изделие',
    text:
      'Зачёт старого золота при покупке нового — не скупка, а часть покупки. ' +
      'Закон допускает, что производитель зачтёт его по своим условиям. Условия ' +
      'у каждого свои и меняются; спрашивайте до сделки.',
  },
  {
    title: 'Слитки и монеты',
    text:
      'Мерные слитки и памятные монеты сдают в банк по его цене, а не в скупку. ' +
      'Нужен сертификат и сохранная упаковка. Через калькулятор лома их считать нельзя.',
  },
  {
    title: 'Ломбард — это не продажа',
    text:
      'Заём под залог: изделие остаётся вашим, пока вы платите проценты. ' +
      'Оценка залога к цене скупки отношения не имеет.',
  },
];

/** Note under the fineness table. */
export const TARIFF_TABLE_NOTE =
  'Цена указана за грамм лигатурной массы изделия соответствующей пробы. ' +
  'Пробу определяют при приёмке — клеймо на изделии не всегда совпадает ' +
  'с результатом опробования.';

/** Caveats beside the input. The most useful thing the page says at all. */
export const CALC_CAVEATS: readonly string[] = [
  'Вес брутто не равен зачётной массе: камни, эмаль, замки из другого металла не считаются.',
  'Клеймо — заявленная проба. Итоговую определит опробование при приёмке.',
];
