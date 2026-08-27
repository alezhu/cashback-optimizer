// Точный решатель: полный перебор (Branch and Bound), который перебирает,
// на какую карту отправить КАЖДЫЙ платёж по отдельности, находя глобально наилучшую
// комбинацию.
//
// Критерии оптимизации (в порядке приоритета):
// 1. Учитываются только активные карты (card.active !== false).
// 2. Максимизация начисленного кэшбека (с учётом ставок и лимитов; limit <= 0 = без лимита).
// 3. Минимизация числа задействованных карт (Bin Packing, устранение бессмысленного дробления).
// 4. Минимизация искусственной наценки округления (roundedSum - billedSum).
// 5. Сохранение целостности групп (минимизация разбиения групп на несколько транзакций).
import { makeTransaction, allocate } from './allocationService';
import { billedOf } from './calcService';
import type { CleanCard, CleanGroup, CleanPayment, CardAllocationResult } from '../types';

const NODE_BUDGET = 1_000_000;

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

interface EvaluationResult {
  cashback: number;
  cardsUsed: number;
  totalIncrease: number;
  txCount: number;
  score: number;
}

export function exactAllocate(cards: CleanCard[], groups: CleanGroup[]): ExactResult {
  const flat: FlatPayment[] = [];
  groups.forEach((g) => g.payments.forEach((p) => flat.push({ payment: p, group: g })));

  const n = flat.length;
  const k = cards.length;

  const activeCards = cards.filter((c) => c.active);

  if (n === 0 || k === 0 || activeCards.length === 0) {
    return { results: cards.map((c) => ({ card: c, transactions: [] })), optimal: true, nodesExplored: 0 };
  }

  // Сортируем платежи по убыванию суммы к списанию — так более значимые решения
  // принимаются раньше и отсечение веток работает эффективнее.
  flat.sort((a, b) => billedOf(b.payment, b.group) - billedOf(a.payment, a.group));

  // Суффиксные суммы billed-значений
  const suffixSum = new Array(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    suffixSum[i] = suffixSum[i + 1] + billedOf(flat[i].payment, flat[i].group);
  }

  const numNonEmptyGroups = groups.filter((g) => g.payments.length > 0).length;

  // Оценка качества распределения
  function evaluate(fullAssignment: number[]): EvaluationResult {
    const perCard: Map<number, Map<number, CleanPayment[]>> = new Map();
    for (let i = 0; i < n; i++) {
      const c = fullAssignment[i];
      const { payment, group } = flat[i];
      if (!perCard.has(c)) perCard.set(c, new Map());
      const byGroup = perCard.get(c)!;
      if (!byGroup.has(group.id)) byGroup.set(group.id, []);
      byGroup.get(group.id)!.push(payment);
    }

    let totalCashback = 0;
    let cardsUsed = 0;
    let totalIncrease = 0;
    let txCount = 0;

    perCard.forEach((byGroup, cardIdx) => {
      const card = cards[cardIdx];
      if (!card.active) return; // неактивные карты не приносят кэшбек

      let cardCashback = 0;
      let cardHasTx = false;

      byGroup.forEach((payments, groupId) => {
        if (payments.length === 0) return;
        cardHasTx = true;
        txCount++;
        const group = groups.find((g) => g.id === groupId)!;
        const tx = makeTransaction({ group, payments }, card);
        cardCashback += tx.cashback;
        totalIncrease += (tx.roundedSum - tx.billedSum);
      });

      if (cardHasTx) {
        cardsUsed++;
      }

      if (card.rate > 0) {
        // limit > 0 -> ограничен лимитом; limit <= 0 -> без лимита
        totalCashback += (card.limit > 0 ? Math.min(cardCashback, card.limit) : cardCashback);
      }
    });

    const splitCount = Math.max(0, txCount - numNonEmptyGroups);
    const extraCards = Math.max(0, cardsUsed - 1);

    const score = totalCashback - extraCards * 10 - totalIncrease * 0.1 - splitCount * 1.0;

    return {
      cashback: totalCashback,
      cardsUsed,
      totalIncrease,
      txCount,
      score,
    };
  }

  function buildResults(assignmentToBuild: number[]): CardAllocationResult[] {
    const cardResults: CardAllocationResult[] = cards.map((c) => ({ card: c, transactions: [] }));

    const perCard: Map<number, Map<number, CleanPayment[]>> = new Map();
    for (let i = 0; i < n; i++) {
      const c = assignmentToBuild[i];
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

  // 1. Инициализация (seeding) результатом эвристики
  const heuristicResults = allocate(cards, groups, 100);
  const heuristicAssignment = new Array(n).fill(-1);
  heuristicResults.forEach((cr, cardIdx) => {
    cr.transactions.forEach((tx) => {
      tx.payments.forEach((p) => {
        const idx = flat.findIndex(
          (fp, i) => heuristicAssignment[i] === -1 && fp.payment.id === p.id && fp.group.id === tx.group.id
        );
        if (idx !== -1) heuristicAssignment[idx] = cardIdx;
      });
    });
  });

  let bestAssignment: number[] = heuristicAssignment.every((c) => c >= 0)
    ? heuristicAssignment.slice()
    : new Array(n).fill(cards.findIndex((c) => c.active));
  let bestScore = evaluate(bestAssignment).score;

  // Суммарный потолок кэшбека
  const hasUnlimitedCard = cards.some((c) => c.active && c.rate > 0 && c.limit <= 0);
  const globalCap = hasUnlimitedCard
    ? Infinity
    : cards.reduce((s, c) => s + (c.active && c.rate > 0 && c.limit > 0 ? c.limit : 0), 0);

  const assignment = new Array(n).fill(-1);
  const runningRaw = new Array(k).fill(0);
  let nodesExplored = 0;
  let truncated = false;

  function dfs(i: number): void {
    if (truncated) return;
    nodesExplored++;
    if (nodesExplored > NODE_BUDGET) {
      truncated = true;
      return;
    }

    if (i === n) {
      const res = evaluate(assignment);
      if (res.score > bestScore) {
        bestScore = res.score;
        bestAssignment = assignment.slice();
        if (res.cashback >= globalCap && res.cardsUsed <= 1) {
          truncated = true;
        }
      }
      return;
    }

    const remaining = suffixSum[i];
    let currentEarned = 0;
    let totalRemainingCap = 0;
    let maxRate = 0;
    let cardsUsedSoFar = 0;
    let hasUnlimited = false;

    for (let c = 0; c < k; c++) {
      const card = cards[c];
      if (runningRaw[c] > 0) {
        cardsUsedSoFar++;
      }
      if (!card.active || card.rate <= 0) continue;
      if (card.rate > maxRate) maxRate = card.rate;
      const cbUpper = Math.ceil(runningRaw[c] * (card.rate / 100));
      if (card.limit > 0) {
        currentEarned += Math.min(cbUpper, card.limit);
        const cbLower = Math.floor(runningRaw[c] * (card.rate / 100));
        totalRemainingCap += Math.max(0, card.limit - cbLower);
      } else {
        currentEarned += cbUpper;
        hasUnlimited = true;
      }
    }

    const potentialAdditional = maxRate > 0 ? Math.ceil(remaining * (maxRate / 100)) : 0;
    const additionalBound = hasUnlimited ? potentialAdditional : Math.min(potentialAdditional, totalRemainingCap);
    const extraCardsPenalty = Math.max(0, cardsUsedSoFar - 1) * 10;
    const bound = currentEarned + additionalBound + 2 - extraCardsPenalty;

    if (bound <= bestScore) return;

    const billed = billedOf(flat[i].payment, flat[i].group);

    // Перебираем только АКТИВНЫЕ карты:
    // 1. Уже используемые активные карты (по убыванию ставки)
    // 2. Пустые активные карты (с отсечением симметрии First Empty Bin)
    const candidateCards: number[] = [];
    const emptyActiveSeen = new Set<string>();

    for (let c = 0; c < k; c++) {
      if (cards[c].active && runningRaw[c] > 0) {
        candidateCards.push(c);
      }
    }
    candidateCards.sort((a, b) => cards[b].rate - cards[a].rate || runningRaw[b] - runningRaw[a]);

    for (let c = 0; c < k; c++) {
      if (cards[c].active && runningRaw[c] === 0) {
        const card = cards[c];
        const sig = `${card.rate},${card.limit},${card.roundTo}`;
        if (!emptyActiveSeen.has(sig)) {
          emptyActiveSeen.add(sig);
          candidateCards.push(c);
        }
      }
    }

    for (const c of candidateCards) {
      assignment[i] = c;
      runningRaw[c] += billed;
      dfs(i + 1);
      runningRaw[c] -= billed;
      if (truncated) break;
    }
  }

  dfs(0);

  return { results: buildResults(bestAssignment), optimal: !truncated, nodesExplored };
}
