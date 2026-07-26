import { round2, billedOf, marginalFactor, chunkBilled, knapsackSelect } from './calcService';
import type { CleanCard, CleanGroup, Chunk, TransactionResult, CardAllocationResult } from '../types';

/**
 * Формирует одну транзакцию (платёж/подмножество платежей одной группы на одной карте):
 * - сумма к списанию с учётом комиссии каждого платежа;
 * - округление вверх до кратной 10 ₽ (чтобы кэшбек считался без потерь на округлении);
 * - на сколько нужно увеличить самый крупный платёж в транзакции, чтобы фактически
 *   получить эту округлённую сумму после начисления комиссии;
 * - кэшбек по карте для округлённой суммы.
 */
function makeTransaction(chunk: Chunk, card: CleanCard): TransactionResult {
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

/**
 * Распределяет группы/платежи по картам.
 * Все карты, кроме последней, жадно заполняются до целевой суммы (лимит/ставка),
 * с допустимым превышением tolerance. Последняя карта получает весь остаток.
 * Группа, не помещающаяся целиком, может быть разбита (через рюкзак) — остаток
 * группы возвращается в пул для следующей карты.
 */
export function allocate(cards: CleanCard[], groups: CleanGroup[], tolerance: number): CardAllocationResult[] {
  // "Пул" — все ещё не распределённые группы. Каждый элемент пула — это группа
  // целиком (или то, что от неё осталось после частичного разбиения на предыдущих
  // картах). Две разные группы никогда не смешиваются в одном элементе пула —
  // это гарантирует, что они не окажутся в одной транзакции.
  let pool: Chunk[] = groups
    .filter((g) => g.payments.length > 0)
    .map((g) => ({ group: g, payments: [...g.payments] }));

  const cardResults: CardAllocationResult[] = cards.map((c) => ({ card: c, transactions: [] }));
  if (cards.length === 0) return cardResults;

  // Все карты, кроме последней, участвуют в жадном заполнении "до цели".
  // Последняя карта в списке — не целевая, она просто забирает весь остаток.
  const fillCards = cards.slice(0, -1);
  const lastCard = cards[cards.length - 1];

  fillCards.forEach((card, cardIdx) => {
    const res = cardResults[cardIdx];

    // Целевая сумма — сумма, при достижении которой кэшбек по карте упрётся
    // в лимит (limit / rate * 100). Если ставка 0% — цели нет, карта не участвует
    // в целевом заполнении (target = Infinity, цикл ниже сразу завершится).
    const target = card.rate > 0 ? (card.limit * 100) / card.rate : Infinity;
    const cap = target + tolerance; // допустимое небольшое превышение цели
    let sum = 0;
    let progress = true;

    // Шаг 1: жадно добавляем на карту целые группы (крупные — в первую очередь,
    // first-fit-decreasing), пока новая группа помещается в оставшуюся вместимость.
    while (sum < target && pool.length > 0 && progress) {
      progress = false;
      pool.sort((a, b) => chunkBilled(b) - chunkBilled(a));
      for (let i = 0; i < pool.length; i++) {
        const csum = chunkBilled(pool[i]);
        if (sum + csum <= cap) {
          res.transactions.push(makeTransaction(pool[i], card));
          sum += csum;
          pool.splice(i, 1);
          progress = true;
          break;
        }
      }
    }

    // Шаг 2: если карта всё ещё не добита до цели, а оставшиеся группы целиком
    // уже не помещаются — разбиваем самую крупную из оставшихся групп рюкзаком:
    // берём максимально близкое к оставшейся вместимости подмножество её платежей,
    // а неиспользованные платежи возвращаем в пул отдельным "куском" той же группы
    // (пойдут отдельной транзакцией на одну из следующих карт).
    if (sum < target - 1e-6 && pool.length > 0 && target !== Infinity) {
      pool.sort((a, b) => chunkBilled(b) - chunkBilled(a));
      const chunk = pool[0];
      const capacityLeft = cap - sum;
      const selIdx = knapsackSelect(chunk.payments, chunk.group, capacityLeft);
      if (selIdx.length > 0) {
        const selectedPayments = selIdx.map((i) => chunk.payments[i]);
        const remainingPayments = chunk.payments.filter((_, i) => !selIdx.includes(i));
        const selectedChunk: Chunk = { group: chunk.group, payments: selectedPayments };

        res.transactions.push(makeTransaction(selectedChunk, card));
        sum += chunkBilled(selectedChunk);
        pool.shift();
        if (remainingPayments.length > 0) {
          pool.push({ group: chunk.group, payments: remainingPayments });
        }
      }
    }
  });

  // Всё, что не поместилось ни на одну целевую карту, целиком уходит на
  // последнюю карту — по одной транзакции на оставшийся кусок группы.
  const lastRes = cardResults[cardResults.length - 1];
  pool.forEach((chunk) => {
    lastRes.transactions.push(makeTransaction(chunk, lastCard));
  });

  return cardResults;
}
