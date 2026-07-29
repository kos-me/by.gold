/**
 * The acceptance procedure — the content of `/kak-proverit-otsenku`.
 *
 * WARNING. This text describes a procedure rather than a price, but it is
 * verified worse than the figures are: it was assembled from the client brief
 * and the mockup, not reconciled against the published acceptance instruction
 * itself. Reconcile it line by line before production — see QUESTIONS.md, B2.
 *
 * No deduction percentage is named here, deliberately: the brief explicitly
 * forbids inventing one and asks for the procedure to be described instead.
 *
 * The step copy is visitor-facing and therefore Russian.
 */

import { GOLD_WEIGHING_PRECISION_G, SILVER_WEIGHING_PRECISION_G } from './calc.ts';
import { formatGrams } from './calc.ts';

export interface Step {
  readonly n: string;
  readonly title: string;
  readonly text: string;
}

export const STEPS: readonly Step[] = [
  {
    n: '01',
    title: 'Проверьте цену за грамм',
    text:
      'На стойке должна быть цена из действующего постановления Минфина. ' +
      'Ниже неё платить не вправе. Выше тарифа бывает только зачёт старого ' +
      'изделия при покупке нового — это другая сделка, не скупка.',
  },
  {
    n: '02',
    title: 'Смотрите, как определяют пробу',
    text:
      'Клеймо только заявляет пробу. При приёмке проводят опробование — ' +
      'реактивом на пробирном камне или прибором — и называют результат при вас. ' +
      'Именно он идёт в расчёт, а не то, что выбито на изделии.',
  },
  {
    n: '03',
    title: 'Следите за весом',
    text:
      'Взвешивают на поверенных весах, при вас, с нулём на пустой чаше. ' +
      'Камни, эмаль и детали из другого металла в зачётную массу не входят: ' +
      'съёмные снимают и возвращают вам, после чего изделие взвешивают заново. ' +
      'Если снять нельзя, поправку согласовывают с вами до расчёта.',
  },
  {
    n: '04',
    title: 'Пересчитайте сумму',
    text:
      'Сумма = зачётная масса × цена за грамм для установленной пробы. ' +
      `Золото взвешивают с точностью до ${formatGrams(GOLD_WEIGHING_PRECISION_G)} г, ` +
      `серебро — до ${formatGrams(SILVER_WEIGHING_PRECISION_G)} г. ` +
      'Посчитайте на телефоне до того, как подписывать.',
  },
  {
    n: '05',
    title: 'Возьмите документ',
    text:
      'Договор или квитанция, где указаны масса, проба, цена за грамм и сумма. ' +
      'Без документа сделку потом не подтвердить.',
  },
];

export const IF_SOMETHING_WRONG =
  'Отказаться от сделки можно на любом этапе до подписания и забрать изделие. ' +
  'Если цена за грамм ниже постановления, попросите показать действующий ' +
  'документ — он должен быть в скупке. Расхождение — повод обратиться ' +
  'в Пробирную инспекцию.';

export interface SourceItem {
  readonly title: string;
  readonly text: string;
  readonly href: string;
}
