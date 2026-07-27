// Точный решатель: полный перебор (с отсечением бесперспективных веток —
// branch and bound), который перебирает, на какую карту отправить КАЖДЫЙ
// платёж по отдельности, и берёт наилучшую по суммарному кэшбеку комбинацию.
//
// В отличие от эвристики (allocationService.ts), здесь нет понятия "цель по
// сумме" и "допустимое превышение" — карта может принять сколько угодно денег,
// а кэшбек просто не растёт сверх её лимита. Поэтому лишние деньги на уже
// заполненной карте никогда не помогают, и решатель сам естественным образом
// избегает такого распределения, максимизируя общую сумму кэшбека напрямую.
//
// Из-за экспоненциального размера пространства решений (число_карт^число_платежей)
// перебор ограничен бюджетом узлов (NODE_BUDGET). Если бюджет исчерпан раньше,
// чем перебор завершился честно, возвращается лучшее найденное решение с
// пометкой optimal:false — оно почти наверняка очень хорошее, но доказанной
// гарантии глобального максимума в этом случае нет.
import { makeTransaction } from './allocationService';
import { billedOf } from './calcService';
import type { CleanCard, CleanGroup, CleanPayment, CardAllocationResult } from '../types';

const NODE_BUDGET = 3_000_000;

export interface ExactResult {
  results: CardAllocationResult[];
  /** true — перебор завершён честно (или найден доказанный оптимум досрочно). */
  optimal: boolean;
  nodesExplored: number;
}

interface FlatPayment {
  payment: CleanPayment;
  group: CleanGroup;
}

export function exactAllocate(cards: CleanCard[], groups: CleanGroup[]): ExactResult {
  const flat: FlatPayment[] = [];
  groups.forEach((g) => g.payments.forEach((p) => flat.push({ payment: p, group: g })));

  const n = flat.length;
  const k = cards.length;

  if (n === 0 || k === 0) {
    return { results: cards.map((c) => ({ card: c, transactions: [] })), optimal: true, nodesExplored: 0 };
  }

  // Сортируем платежи по убыванию суммы — так более значимые решения
  // принимаются раньше и отсечение веток работает эффективнее.
  flat.sort((a, b) => billedOf(b.payment, b.group) - billedOf(a.payment, a.group));

  // Суффиксные суммы billed-значений — сколько ещё максимум могут добавить
  // ещё не распределённые платежи (используется в верхней границе для отсечения).
  const suffixSum = new Array(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    suffixSum[i] = suffixSum[i + 1] + billedOf(flat[i].payment, flat[i].group);
  }

  // Простая (но допустимая, т.е. заведомо не заниженная) верхняя граница
  // глобального максимума: сумма лимитов кэшбека всех карт со ставкой > 0.
  // Если найденный результат когда-нибудь её достигнет — это точно оптимум,
  // дальше можно не искать.
  const globalCap = cards.reduce((s, c) => s + (c.rate > 0 ? c.limit : 0), 0);

  const assignment = new Array(n).fill(-1);
  const runningRaw = new Array(k).fill(0);
  let bestAssignment: number[] | null = null;
  let bestTotal = -1;
  let nodesExplored = 0;
  let truncated = false;

  // Точная оценка полностью готового распределения — группируем платежи по
  // (карта, группа), считаем настоящую (округлённую вверх до 10 ₽) сумму
  // транзакции и её кэшбек, суммируем по карте с учётом лимита.
  function evaluate(fullAssignment: number[]): number {
    const perCard: Map<number, Map<number, CleanPayment[]>> = new Map();
    for (let i = 0; i < n; i++) {
      const c = fullAssignment[i];
      const { payment, group } = flat[i];
      if (!perCard.has(c)) perCard.set(c, new Map());
      const byGroup = perCard.get(c)!;
      if (!byGroup.has(group.id)) byGroup.set(group.id, []);
      byGroup.get(group.id)!.push(payment);
    }

    let total = 0;
    perCard.forEach((byGroup, cardIdx) => {
      const card = cards[cardIdx];
      let cardCashback = 0;
      byGroup.forEach((payments, groupId) => {
        const group = groups.find((g) => g.id === groupId)!;
        cardCashback += makeTransaction({ group, payments }, card).cashback;
      });
      total += card.limit > 0 ? Math.min(cardCashback, card.limit) : cardCashback;
    });
    return total;
  }

  function buildResults(): CardAllocationResult[] {
    const cardResults: CardAllocationResult[] = cards.map((c) => ({ card: c, transactions: [] }));
    if (!bestAssignment) return cardResults;

    const perCard: Map<number, Map<number, CleanPayment[]>> = new Map();
    for (let i = 0; i < n; i++) {
      const c = bestAssignment[i];
      const { payment, group } = flat[i];
      if (!perCard.has(c)) perCard.set(c, new Map());
      const byGroup = perCard.get(c)!;
      if (!byGroup.has(group.id)) byGroup.set(group.id, []);
      byGroup.get(group.id)!.push(payment);
    }

    perCard.forEach((byGroup, cardIdx) => {
      const card = cards[cardIdx];
      byGroup.forEach((payments, groupId) => {
        const group = groups.find((g) => g.id === groupId)!;
        cardResults[cardIdx].transactions.push(makeTransaction({ group, payments }, card));
      });
    });
    return cardResults;
  }

  function dfs(i: number): void {
    if (truncated) return;
    nodesExplored++;
    if (nodesExplored > NODE_BUDGET) {
      truncated = true;
      return;
    }

    if (i === n) {
      const total = evaluate(assignment);
      if (total > bestTotal) {
        bestTotal = total;
        bestAssignment = assignment.slice();
        if (bestTotal >= globalCap) truncated = true; // доказанный оптимум — можно остановиться
      }
      return;
    }

    // Верхняя граница для этой ветки: приближённый (без учёта округления вверх
    // до 10 ₽ и группировки по картам) кэшбек с уже назначенных платежей плюс
    // оптимистичный потенциал ещё не распределённых. "+ (n - i)" — небольшой
    // запас на случай, если округление вверх даст чуть больше реального
    // кэшбека, чем эта грубая оценка, — чтобы не отсечь ветку, которая на
    // самом деле могла бы оказаться лучше.
    const remaining = suffixSum[i];
    let bound = 0;
    for (let c = 0; c < k; c++) {
      const card = cards[c];
      if (card.rate <= 0) continue;
      const potential = Math.ceil((runningRaw[c] + remaining) * (card.rate / 100));
      bound += card.limit > 0 ? Math.min(card.limit, potential) : potential;
    }
    bound += n - i;
    if (bound <= bestTotal) return; // эта ветка заведомо не лучше уже найденного

    const billed = billedOf(flat[i].payment, flat[i].group);
    for (let c = 0; c < k; c++) {
      assignment[i] = c;
      runningRaw[c] += billed;
      dfs(i + 1);
      runningRaw[c] -= billed;
      if (truncated) break;
    }
  }

  dfs(0);

  return { results: buildResults(), optimal: !truncated, nodesExplored };
}
