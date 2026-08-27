import { round2, billedOf, marginalFactor, chunkBilled, pickClosestChunks, pickClosestPayments } from './calcService';
import type { CleanCard, CleanGroup, Chunk, TransactionResult, CardAllocationResult } from '../types';

/**
 * Вычисляет, до какой суммы нужно округлить сумму к списанию, чтобы кэшбек
 * был кратен card.roundTo рублей.
 *
 * Если card.roundTo === 0 (не задан) или ставка не задана — округление не применяется:
 * банк считает кэшбек с фактической суммы к списанию (с точностью до копейки).
 *
 * Если card.roundTo > 0:
 *   шаг = roundTo * 100 / rate (₽ суммы на одну единицу roundTo кэшбека)
 *   roundedFloat = ceil(billedSum / step) * step
 *   roundedSum   = ceil(roundedFloat) — к целому рублю вверх
 */
function computeRoundedSum(billedSum: number, card: CleanCard): number {
  const { rate, roundTo } = card;
  if (roundTo <= 0 || rate <= 0) {
    return round2(billedSum);
  }
  const step = (roundTo * 100) / rate;
  const roundedFloat = Math.ceil(round2(billedSum) / step - 1e-9) * step;
  return Math.ceil(round2(roundedFloat) - 1e-9);
}

/**
 * Формирует одну транзакцию (платёж/подмножество платежей одной группы на одной карте):
 * - сумма к списанию с учётом комиссии каждого платежа;
 * - округление вверх до суммы, при которой кэшбек кратен card.roundTo;
 * - на сколько нужно увеличить самый крупный платёж в транзакции;
 * - кэшбек по карте для округлённой суммы.
 */
export function makeTransaction(chunk: Chunk, card: CleanCard): TransactionResult {
  const group = chunk.group;
  const payments = chunk.payments;

  const enteredOriginal = round2(payments.reduce((s, p) => s + p.amount, 0));
  const billedSum = round2(payments.reduce((s, p) => s + billedOf(p, group), 0));

  const roundedSum = computeRoundedSum(billedSum, card);
  const increaseBilled = round2(roundedSum - billedSum);

  let adjustIdx = 0;
  payments.forEach((p, i) => {
    if (p.amount > payments[adjustIdx].amount) adjustIdx = i;
  });
  const adjustPayment = payments[adjustIdx];

  const factor = marginalFactor(adjustPayment, group);
  const increaseEntered = round2(increaseBilled * factor);

  const adjustedPayment = { ...adjustPayment, amount: round2(adjustPayment.amount + increaseEntered) };
  const factBilledSum = round2(
    payments.reduce((s, p, i) => s + billedOf(i === adjustIdx ? adjustedPayment : p, group), 0)
  );

  const cashback = Math.floor(roundedSum * (card.rate / 100));

  return {
    group,
    groupName: group.name,
    payments,
    adjustIdx,
    enteredOriginal,
    billedSum,
    roundedSum,
    increaseEntered,
    factBilledSum,
    cashback,
  };
}

/** Убирает из чанка платежи с данными индексами, возвращая (взятое, оставшееся). */
function splitChunkByIdx(chunk: Chunk, selIdx: number[]): { taken: Chunk; rest: Chunk | null } {
  const selSet = new Set(selIdx);
  const taken: Chunk = { group: chunk.group, payments: selIdx.map((i) => chunk.payments[i]) };
  const restPayments = chunk.payments.filter((_, i) => !selSet.has(i));
  const rest = restPayments.length > 0 ? { group: chunk.group, payments: restPayments } : null;
  return { taken, rest };
}

/**
 * Заполняет одну карту из пула оставшихся кусков (групп/их частей).
 */
function fillCard(pool: Chunk[], card: CleanCard, target: number, cap: number): TransactionResult[] {
  const transactions: TransactionResult[] = [];
  let sum = 0;

  // Шаг 1: лучшая комбинация целых кусков, максимально близкая к target.
  const wholeIdx = pickClosestChunks(pool, target, cap);
  if (wholeIdx.length > 0) {
    for (let k = wholeIdx.length - 1; k >= 0; k--) {
      const i = wholeIdx[k];
      const chunk = pool[i];
      transactions.push(makeTransaction(chunk, card));
      sum += chunkBilled(chunk);
      pool.splice(i, 1);
    }
  }

  // Шаг 2: пока есть зазор до target — разбиваем наиболее подходящую группу
  while (sum < target - 1e-6 && pool.length > 0) {
    const remainingTarget = target - sum;
    const remainingCap = cap - sum;
    if (remainingCap <= 0) break;

    let bestIdx = -1;
    let bestSelIdx: number[] = [];
    let bestAchieved = -1;
    let bestMeetsTarget = false;

    pool.forEach((chunk, i) => {
      const selIdx = pickClosestPayments(chunk.payments, chunk.group, remainingTarget, remainingCap);
      if (selIdx.length === 0) return;
      const achieved = chunkBilled({ group: chunk.group, payments: selIdx.map((j) => chunk.payments[j]) });
      const meets = achieved >= remainingTarget - 1e-6;

      if (bestIdx === -1) {
        bestIdx = i;
        bestSelIdx = selIdx;
        bestAchieved = achieved;
        bestMeetsTarget = meets;
        return;
      }
      if (meets && bestMeetsTarget) {
        if (achieved < bestAchieved) {
          bestIdx = i;
          bestSelIdx = selIdx;
          bestAchieved = achieved;
        }
      } else if (meets && !bestMeetsTarget) {
        bestIdx = i;
        bestSelIdx = selIdx;
        bestAchieved = achieved;
        bestMeetsTarget = true;
      } else if (!meets && !bestMeetsTarget) {
        if (achieved > bestAchieved) {
          bestIdx = i;
          bestSelIdx = selIdx;
          bestAchieved = achieved;
        }
      }
    });

    if (bestIdx === -1) break;

    const { taken, rest } = splitChunkByIdx(pool[bestIdx], bestSelIdx);
    transactions.push(makeTransaction(taken, card));
    sum += chunkBilled(taken);

    if (rest) {
      pool[bestIdx] = rest;
    } else {
      pool.splice(bestIdx, 1);
    }
  }

  return transactions;
}

/**
 * Распределяет группы/платежи по картам.
 * Приоритет распределения:
 * 1. Учитываются только активные карты (card.active !== false).
 * 2. Карты с максимальной процентной ставкой кэшбека.
 * 3. Минимизация числа задействованных карт внутри одного тарифа/уровня (Bin Packing).
 * 4. Лимит кэшбека: limit > 0 — ограничение, limit <= 0 — без лимита (Infinity).
 */
export function allocate(cards: CleanCard[], groups: CleanGroup[], tolerance: number): CardAllocationResult[] {
  const pool: Chunk[] = groups
    .filter((g) => g.payments.length > 0)
    .map((g) => ({ group: g, payments: [...g.payments] }));

  const cardResults: CardAllocationResult[] = cards.map((c) => ({ card: c, transactions: [] }));
  if (cards.length === 0 || pool.length === 0) return cardResults;

  // Группируем только АКТИВНЫЕ карты со ставкой > 0 по убыванию ставки кэшбека
  const rateTiersMap = new Map<number, { card: CleanCard; originalIdx: number }[]>();
  cards.forEach((c, originalIdx) => {
    if (c.active && c.rate > 0) {
      if (!rateTiersMap.has(c.rate)) rateTiersMap.set(c.rate, []);
      rateTiersMap.get(c.rate)!.push({ card: c, originalIdx });
    }
  });

  const sortedRates = Array.from(rateTiersMap.keys()).sort((a, b) => b - a);

  for (const rate of sortedRates) {
    if (pool.length === 0) break;
    const tier = rateTiersMap.get(rate)!;
    const poolBilledSum = pool.reduce((s, ch) => s + chunkBilled(ch), 0);

    // limit > 0 -> target = limit*100/rate, cap = target + tolerance
    // limit <= 0 -> без лимита (Infinity)
    const tierWithCaps = tier.map((entry) => {
      const isUnlimited = entry.card.limit <= 0;
      const target = isUnlimited ? Infinity : (entry.card.limit * 100) / entry.card.rate;
      const cap = isUnlimited ? Infinity : target + tolerance;
      return { ...entry, isUnlimited, target, cap };
    });

    // Стратегия 1: Проверяем, помещается ли весь оставшийся пул платежей на ОДНУ карту из этого тарифа.
    const singleFitCards = tierWithCaps.filter((entry) => entry.cap >= poolBilledSum - 1e-6);

    if (singleFitCards.length > 0) {
      // Ограниченные карты с наименьшей достаточной ёмкостью сортируются первыми,
      // затем безлимитные карты, при равенстве — по порядку в интерфейсе.
      singleFitCards.sort((a, b) => a.cap - b.cap || a.originalIdx - b.originalIdx);
      const chosen = singleFitCards[0];
      const fillTarget = chosen.isUnlimited ? poolBilledSum : chosen.target;
      const fillCap = chosen.isUnlimited ? poolBilledSum + tolerance + 1000 : chosen.cap;
      cardResults[chosen.originalIdx].transactions = fillCard(pool, chosen.card, fillTarget, fillCap);
      continue;
    }

    // Стратегия 2: Если на одну карту всё не помещается, сортируем карты тарифа по убыванию ёмкости
    tierWithCaps.sort((a, b) => b.cap - a.cap || a.originalIdx - b.originalIdx);

    for (const entry of tierWithCaps) {
      if (pool.length === 0) break;
      const fillTarget = entry.isUnlimited ? poolBilledSum : entry.target;
      const fillCap = entry.isUnlimited ? poolBilledSum + tolerance + 1000 : entry.cap;
      cardResults[entry.originalIdx].transactions = fillCard(pool, entry.card, fillTarget, fillCap);
    }
  }

  // Если после всех активных карт со ставкой > 0 остались платежи —
  // отправляем их на активную остаточную карту (неактивные карты никогда не используются)
  if (pool.length > 0) {
    const activeIndices = cards
      .map((c, idx) => ({ c, idx }))
      .filter(({ c }) => c.active);

    if (activeIndices.length > 0) {
      const unusedActive = activeIndices.find(
        ({ idx, c }) => cardResults[idx].transactions.length === 0 && c.rate <= 0
      );
      const targetIdx = unusedActive ? unusedActive.idx : activeIndices[activeIndices.length - 1].idx;
      const targetCard = cards[targetIdx];
      pool.forEach((chunk) => {
        cardResults[targetIdx].transactions.push(makeTransaction(chunk, targetCard));
      });
    }
  }

  return cardResults;
}
