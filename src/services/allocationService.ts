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
 *
 * Для дробного шага (напр., rate = 3 %, roundTo = 1 → шаг ≈ 33.33 ₽) второй
 * ceil гарантирует целочисленный результат и floor(sum * rate/100) % roundTo === 0.
 */
function computeRoundedSum(billedSum: number, card: CleanCard): number {
  const { rate, roundTo } = card;
  if (roundTo <= 0 || rate <= 0) {
    // Без округления: банк считает кэшбек с фактической суммы к списанию.
    return round2(billedSum);
  }
  const step = (roundTo * 100) / rate;
  const roundedFloat = Math.ceil(round2(billedSum) / step - 1e-9) * step;
  return Math.ceil(round2(roundedFloat) - 1e-9);
}

/**
 * Формирует одну транзакцию (платёж/подмножество платежей одной группы на одной карте):
 * - сумма к списанию с учётом комиссии каждого платежа;
 * - округление вверх до суммы, при которой кэшбек кратен card.roundTo (или до 10 ₽, если roundTo = 0);
 * - на сколько нужно увеличить самый крупный платёж в транзакции, чтобы фактически
 *   получить эту округлённую сумму после начисления комиссии;
 * - кэшбек по карте для округлённой суммы.
 *
 * Экспортируется — используется и эвристикой (allocate), и точным решателем
 * (exactAllocationService.ts), чтобы обе считали транзакцию одинаково.
 */
export function makeTransaction(chunk: Chunk, card: CleanCard): TransactionResult {
  const group = chunk.group;
  const payments = chunk.payments;

  // Сколько было изначально введено (до комиссии) и сколько спишется по факту
  // (с комиссией каждого платежа).
  const enteredOriginal = round2(payments.reduce((s, p) => s + p.amount, 0));
  const billedSum = round2(payments.reduce((s, p) => s + billedOf(p, group), 0));

  // Округляем сумму к списанию вверх — только «вверх», так как платежи можно
  // только увеличивать. Конкретный шаг зависит от card.roundTo.
  const roundedSum = computeRoundedSum(billedSum, card);
  const increaseBilled = round2(roundedSum - billedSum);

  // Увеличивать будем самый крупный платёж транзакции — так относительное
  // искажение суммы платежа минимально.
  let adjustIdx = 0;
  payments.forEach((p, i) => {
    if (p.amount > payments[adjustIdx].amount) adjustIdx = i;
  });
  const adjustPayment = payments[adjustIdx];

  // Переводим требуемое увеличение суммы К СПИСАНИЮ в увеличение ВВОДИМОЙ суммы
  // платежа (см. marginalFactor: зависит от того, привязана ли комиссия к min/max
  // или округляется ли она до целого).
  const factor = marginalFactor(adjustPayment, group);
  const increaseEntered = round2(increaseBilled * factor);

  // Проверяем, что увеличение реально даёт нужную округлённую сумму (актуально,
  // когда комиссия округляется/зажата по min-max — линейное приближение может
  // немного разойтись с фактом).
  const adjustedPayment = { ...adjustPayment, amount: round2(adjustPayment.amount + increaseEntered) };
  const factBilledSum = round2(
    payments.reduce((s, p, i) => s + billedOf(i === adjustIdx ? adjustedPayment : p, group), 0)
  );

  // Кэшбек по карте на округлённую сумму транзакции (округление вниз до рубля —
  // так его считает банк; максимум по карте применяется позже, при суммировании
  // всех транзакций карты).
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
 * Заполняет одну карту из пула оставшихся кусков (групп/их частей), стараясь
 * набрать сумму как можно ближе к target (не обязательно максимум — важно не
 * "перебрать" сверх target без необходимости, иначе лишние деньги, которые
 * могли бы пойти на другую карту, будут потрачены впустую сверх лимита кэшбека).
 *
 * Подбор в два шага:
 * 1) pickClosestChunks — лучшая комбинация ЦЕЛЫХ кусков (групп), максимально
 *    близкая к target (с минимальным превышением, если точно попасть нельзя).
 * 2) Если после этого остаётся зазор до target — на каждой итерации перебираем
 *    оставшиеся куски и для каждого считаем pickClosestPayments (разбиение
 *    внутри одной группы), выбираем тот, что даёт лучший результат (минимальное
 *    превышение над оставшимся зазором, а если target недостижим — максимальную
 *    сумму). Берём его, остаток группы возвращаем в пул для следующей карты,
 *    и повторяем, пока есть зазор и что добавить.
 */
function fillCard(pool: Chunk[], card: CleanCard, target: number, cap: number): TransactionResult[] {
  const transactions: TransactionResult[] = [];
  let sum = 0;

  // Шаг 1: лучшая комбинация целых кусков, максимально близкая к target.
  const wholeIdx = pickClosestChunks(pool, target, cap);
  if (wholeIdx.length > 0) {
    // Идём с конца, чтобы splice по индексу не сдвигал ещё не обработанные индексы.
    for (let k = wholeIdx.length - 1; k >= 0; k--) {
      const i = wholeIdx[k];
      const chunk = pool[i];
      transactions.push(makeTransaction(chunk, card));
      sum += chunkBilled(chunk);
      pool.splice(i, 1);
    }
  }

  // Шаг 2: пока есть зазор до target — ищем кусок, разбиение которого даёт
  // наилучший результат для оставшегося зазора, и разбиваем именно его.
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
        // Оба варианта закрывают зазор — предпочитаем тот, что ближе к target
        // (минимальное превышение).
        if (achieved < bestAchieved) {
          bestIdx = i;
          bestSelIdx = selIdx;
          bestAchieved = achieved;
        }
      } else if (meets && !bestMeetsTarget) {
        // Новый вариант закрывает зазор, а прежний — нет: новый явно лучше.
        bestIdx = i;
        bestSelIdx = selIdx;
        bestAchieved = achieved;
        bestMeetsTarget = true;
      } else if (!meets && !bestMeetsTarget) {
        // Ни один вариант не дотягивает до target — берём тот, что даёт больше.
        if (achieved > bestAchieved) {
          bestIdx = i;
          bestSelIdx = selIdx;
          bestAchieved = achieved;
        }
      }
      // (!meets && bestMeetsTarget) — прежний вариант и так закрывает зазор, оставляем его.
    });

    if (bestIdx === -1) break; // ни один оставшийся кусок больше не помещается

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
 * 1. Карты с максимальной процентной ставкой кэшбека.
 * 2. Минимизация числа задействованных карт внутри одного тарифа/уровня (Bin Packing).
 * 3. Переход к картам с меньшей ставкой / остаточным картам только при исчерпании лимитов.
 */
export function allocate(cards: CleanCard[], groups: CleanGroup[], tolerance: number): CardAllocationResult[] {
  const pool: Chunk[] = groups
    .filter((g) => g.payments.length > 0)
    .map((g) => ({ group: g, payments: [...g.payments] }));

  const cardResults: CardAllocationResult[] = cards.map((c) => ({ card: c, transactions: [] }));
  if (cards.length === 0 || pool.length === 0) return cardResults;

  // Группируем активные карты (со ставкой > 0 и лимитом > 0) по убыванию ставки кэшбека
  const rateTiersMap = new Map<number, { card: CleanCard; originalIdx: number }[]>();
  cards.forEach((c, originalIdx) => {
    if (c.rate > 0 && c.limit > 0) {
      if (!rateTiersMap.has(c.rate)) rateTiersMap.set(c.rate, []);
      rateTiersMap.get(c.rate)!.push({ card: c, originalIdx });
    }
  });

  const sortedRates = Array.from(rateTiersMap.keys()).sort((a, b) => b - a);

  for (const rate of sortedRates) {
    if (pool.length === 0) break;
    const tier = rateTiersMap.get(rate)!;
    const poolBilledSum = pool.reduce((s, ch) => s + chunkBilled(ch), 0);

    // Стратегия 1: Проверяем, помещается ли весь оставшийся пул платежей на ОДНУ карту из этого тарифа.
    // Если да — выбираем наилучшую одиночную карту (с наименьшей достаточной ёмкостью, при равенстве — первую по порядку).
    const singleFitCards = tier
      .map((entry) => ({
        ...entry,
        cap: (entry.card.limit * 100) / entry.card.rate + tolerance,
        target: (entry.card.limit * 100) / entry.card.rate,
      }))
      .filter((entry) => entry.cap >= poolBilledSum - 1e-6);

    if (singleFitCards.length > 0) {
      singleFitCards.sort((a, b) => a.cap - b.cap || a.originalIdx - b.originalIdx);
      const chosen = singleFitCards[0];
      cardResults[chosen.originalIdx].transactions = fillCard(pool, chosen.card, chosen.target, chosen.cap);
      continue;
    }

    // Стратегия 2: Если на одну карту всё не помещается, сортируем карты тарифа по убыванию ёмкости,
    // чтобы заполнять крупные карты первыми и минимизировать общее число задействованных карт.
    const sortedTier = [...tier].sort((a, b) => {
      const capA = (a.card.limit * 100) / a.card.rate;
      const capB = (b.card.limit * 100) / b.card.rate;
      return capB - capA || a.originalIdx - b.originalIdx;
    });

    for (const entry of sortedTier) {
      if (pool.length === 0) break;
      const target = (entry.card.limit * 100) / entry.card.rate;
      const cap = target + tolerance;
      cardResults[entry.originalIdx].transactions = fillCard(pool, entry.card, target, cap);
    }
  }

  // Если после всех активных карт остались нераспределённые платежи — отправляем их на остаточную карту
  if (pool.length > 0) {
    const residualIdx = cards.findIndex(
      (c, idx) => cardResults[idx].transactions.length === 0 && (c.limit <= 0 || c.rate <= 0)
    );
    const targetIdx = residualIdx !== -1 ? residualIdx : cards.length - 1;
    const targetCard = cards[targetIdx];
    pool.forEach((chunk) => {
      cardResults[targetIdx].transactions.push(makeTransaction(chunk, targetCard));
    });
  }

  return cardResults;
}
