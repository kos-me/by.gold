/**
 * The acceptance procedure — the content of `/kak-proverit-otsenku`.
 *
 * SOURCE. Reconciled against the governing act: Council of Ministers
 * resolution of 12 September 2011 № 1211, "О правилах скупки у граждан
 * драгоценных металлов и драгоценных камней в изделиях и ломе" (National
 * Register 5/34430). The text used was the verbatim original published in the
 * National Register, read on 29 July 2026. Point numbers are cited per step
 * below so any claim can be traced back.
 *
 * STILL UNVERIFIED. That act has been amended three times — by resolutions
 * № 246 (03.04.2017), № 301 (10.05.2023) and № 268 (16.05.2025). Their
 * consolidated text is only available through ЭТАЛОН, which needs a
 * subscription, so the amendments have **not** been checked. Nothing below
 * asserts anything the 2011 original does not say, but a provision could have
 * changed since. See QUESTIONS.md, B2.
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
    // Rules, point 6: the buyback point must display, where the seller can
    // conveniently read them, the current buyback prices, a copy of the
    // licence, and an extract from the Rules covering how mass, assay and
    // valuation are determined.
    n: '01',
    title: 'Посмотрите, что висит на стойке',
    text:
      'В пункте скупки на видном месте должны быть действующие скупочные цены, ' +
      'копия лицензии и выписка из правил — о том, как определяют массу, пробу ' +
      'и оценку. Ниже цены из постановления платить не вправе. Выше тарифа ' +
      'бывает только зачёт старого изделия при покупке нового: это другая сделка.',
  },
  {
    // Points 8 and 12: buyback happens regardless of maker's marks and assay
    // hallmarks; the fineness is determined at points free of solder.
    n: '02',
    title: 'Смотрите, как определяют пробу',
    text:
      'Скупка не зависит от того, есть на изделии клеймо или нет: пробу всё равно ' +
      'определяют при приёмке — реактивом или прибором, в месте без припоя. ' +
      'Именно этот результат идёт в расчёт, а не то, что выбито на изделии.',
  },
  {
    // Points 9, 11 and 13: every operation happens in the seller's presence;
    // the scales are placed so the seller can satisfy themselves as to the
    // total mass; removable non-precious parts are taken out with the seller's
    // agreement and returned, after which the item is weighed again; where
    // removal is impossible the correction is agreed with the seller.
    n: '03',
    title: 'Следите за весом',
    text:
      'Определение массы и пробы, удаление вставок, упаковку — всё это делают ' +
      'при вас. Весы ставят так, чтобы вы могли сами убедиться в массе. Съёмные ' +
      'части из недрагоценных материалов снимают с вашего согласия и возвращают ' +
      'вам, после чего изделие взвешивают заново. Если снять нельзя — пружинки ' +
      'в замках, эмаль — поправку на их массу считают при вас и по согласию.',
  },
  {
    // Point 11: mass is determined to 0.1 g for silver and 0.01 g for other
    // precious metals, "без учета математического округления".
    n: '04',
    title: 'Пересчитайте сумму',
    text:
      'Сумма = зачётная масса × цена за грамм для установленной пробы. Массу ' +
      `определяют с точностью до ${formatGrams(GOLD_WEIGHING_PRECISION_G)} г для золота и до ` +
      `${formatGrams(SILVER_WEIGHING_PRECISION_G)} г для серебра, без математического округления. ` +
      'Посчитайте на телефоне до того, как соглашаться.',
  },
  {
    // Points 14 and 15: documents are filled in once the seller agrees to the
    // valuation; once paid for, bought items are not returnable.
    n: '05',
    title: 'Возьмите документ',
    text:
      'Документы заполняют, когда вы согласились с оценкой. Возьмите свой ' +
      'экземпляр: в нём масса, проба, цена за грамм и сумма. После оплаты ' +
      'сданное возврату не подлежит — поэтому проверять надо до, а не после.',
  },
];

/**
 * Every stage of the procedure requires the seller's agreement (points 13 and
 * 14), and only point 15 closes the door — after payment. So walking away
 * before agreeing is always available.
 */
export const IF_SOMETHING_WRONG =
  'Пока вы не согласились с оценкой и не получили оплату, сделки нет: можно ' +
  'отказаться и забрать изделие. Если цена за грамм ниже постановления, ' +
  'попросите показать действующие цены — они обязаны висеть в пункте скупки. ' +
  'Расхождение — повод обратиться в пробирный надзор.';

export interface SourceItem {
  readonly title: string;
  readonly text: string;
  readonly href: string;
}
