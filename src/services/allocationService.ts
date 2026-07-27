import { round2, billedOf, marginalFactor, chunkBilled, pickClosestChunks, pickClosestPayments } from './calcService';
import type { CleanCard, CleanGroup, Chunk, TransactionResult, CardAllocationResult } from '../types';

/**
 * Формирует одну транзакцию (платёж/подмножество платежей одной группы на одной карте):
 * - сумма к списанию с учётом комиссии каждого платежа;
 * - округление вверх до кратной 10 ₽ (чтобы кэшбек считался без потерь на округлении);
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

  // Округляем сумму к списанию вверх до ближайшей кратной 10 ₽ — только "вверх",
  // так как платежи можно только увеличивать, а кэшбек на кратной 10 сумме
  // считается без потерь на округлении вниз.
  const roundedSum = Math.ceil(round2(billedSum) / 10 - 1e-9) * 10;
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
 * Все карты, кроме последней, заполняются как можно ближе к целевой сумме
 * (лимит/ставка) — см. fillCard. Последняя карта получает весь остаток.
 */
export function allocate(cards: CleanCard[], groups: CleanGroup[], tolerance: number): CardAllocationResult[] {
  // "Пул" — все ещё не распределённые группы. Каждый элемент пула — это группа
  // целиком (или то, что от неё осталось после частичного разбиения на предыдущих
  // картах). Две разные группы никогда не смешиваются в одном элементе пула —
  // это гарантирует, что они не окажутся в одной транзакции.
  const pool: Chunk[] = groups
    .filter((g) => g.payments.length > 0)
    .map((g) => ({ group: g, payments: [...g.payments] }));

  const cardResults: CardAllocationResult[] = cards.map((c) => ({ card: c, transactions: [] }));
  if (cards.length === 0) return cardResults;

  // Все карты, кроме последней, участвуют в целевом заполнении.
  // Последняя карта в списке — не целевая, она просто забирает весь остаток.
  const fillCards = cards.slice(0, -1);
  const lastCard = cards[cards.length - 1];

  fillCards.forEach((card, cardIdx) => {
    // Целевая сумма — сумма, при достижении которой кэшбек по карте упрётся
    // в лимит (limit / rate * 100). Если ставка 0% — цели нет, карта пропускает
    // целевое заполнение (ничего не берёт на этом шаге).
    if (card.rate <= 0) return;
    const target = (card.limit * 100) / card.rate;
    const cap = target + tolerance; // допустимое небольшое превышение цели
    cardResults[cardIdx].transactions = fillCard(pool, card, target, cap);
  });

  // Всё, что не поместилось ни на одну целевую карту, целиком уходит на
  // последнюю карту — по одной транзакции на оставшийся кусок группы.
  const lastRes = cardResults[cardResults.length - 1];
  pool.forEach((chunk) => {
    lastRes.transactions.push(makeTransaction(chunk, lastCard));
  });

  return cardResults;
}
