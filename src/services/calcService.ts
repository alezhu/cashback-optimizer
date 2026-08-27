// Базовые расчёты по одному платежу: комиссия, сумма к списанию, метки clamp/override,
// плюс подбор подмножества ("рюкзак"), максимально близкого к целевой сумме.
// Работает только с "чистыми" типами (CleanPayment/CleanGroup) — все числовые
// поля здесь уже гарантированно number|null, конвертация форм происходит в
// normalize.ts до вызова этих функций.
import type { CleanPayment, CleanGroup, Chunk } from '../types';

// Округление до копеек, устраняющее артефакты плавающей точки (0.1 + 0.2 и т.п.).
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Эффективная ставка комиссии для платежа: override платежа, иначе — комиссия группы. */
export function paymentCommissionRate(payment: CleanPayment, group: CleanGroup): number {
  return payment.commissionOverride != null ? payment.commissionOverride : group.commission;
}

/** Округление комиссии до целого: override платежа, иначе — настройка группы. */
export function paymentRoundCommission(payment: CleanPayment, group: CleanGroup): boolean {
  return payment.roundCommissionOverride != null ? payment.roundCommissionOverride : group.roundCommission;
}

/** Нижняя граница комиссии для платежа: override платежа, иначе — настройка группы. */
export function paymentMinCommission(payment: CleanPayment, group: CleanGroup): number | null {
  return payment.minCommissionOverride != null ? payment.minCommissionOverride : group.minCommission;
}

/** Верхняя граница комиссии для платежа: override платежа, иначе — настройка группы. */
export function paymentMaxCommission(payment: CleanPayment, group: CleanGroup): number | null {
  return payment.maxCommissionOverride != null ? payment.maxCommissionOverride : group.maxCommission;
}

/** true, если платёж действительно использует свою ставку, а не ставку группы. */
export function isRateOverridden(payment: CleanPayment): boolean {
  return payment.commissionOverride != null;
}

/** Сырая (до min/max/округления) сумма комиссии. */
function rawCommission(payment: CleanPayment, group: CleanGroup): number {
  const rate = paymentCommissionRate(payment, group);
  return payment.amount * (rate / 100);
}

/** true, если сумма комиссии была подрезана минимумом или максимумом. */
export function isCommissionClamped(payment: CleanPayment, group: CleanGroup): boolean {
  const amt = rawCommission(payment, group);
  const minC = paymentMinCommission(payment, group);
  const maxC = paymentMaxCommission(payment, group);
  if (minC !== null && amt < minC) return true;
  if (maxC !== null && amt > maxC) return true;
  return false;
}

/** Итоговая сумма комиссии по платежу с учётом override/min/max/округления. */
export function commissionAmount(payment: CleanPayment, group: CleanGroup): number {
  let amt = rawCommission(payment, group);
  const minC = paymentMinCommission(payment, group);
  const maxC = paymentMaxCommission(payment, group);
  const roundC = paymentRoundCommission(payment, group);
  if (minC !== null) amt = Math.max(amt, minC);
  if (maxC !== null) amt = Math.min(amt, maxC);
  if (roundC) amt = Math.round(amt);
  return amt;
}

/** Сумма к списанию по платежу (сумма + комиссия). */
export function billedOf(payment: CleanPayment, group: CleanGroup): number {
  return payment.amount + commissionAmount(payment, group);
}

/**
 * Приблизительная производная d(введённая сумма)/d(сумма к списанию) для небольшого
 * увеличения платежа — используется, чтобы посчитать, на сколько увеличить исходную
 * (введённую) сумму платежа, чтобы сумма к списанию выросла на нужную величину.
 *
 * - Если комиссия округляется до целого рубля, небольшое увеличение суммы платежа
 *   (единицы рублей) на практике не меняет округлённую комиссию — считаем фактор 1.
 * - Если комиссия уже упирается в min/max, она не меняется при малом
 *   увеличении суммы — тоже фактор 1.
 * - Иначе комиссия линейна от суммы: фактор = 1 / (1 + ставка/100).
 */
export function marginalFactor(payment: CleanPayment, group: CleanGroup): number {
  const roundC = paymentRoundCommission(payment, group);
  if (roundC) return 1;
  if (isCommissionClamped(payment, group)) return 1;
  const rate = paymentCommissionRate(payment, group);
  return 1 / (1 + rate / 100);
}

// Суммарная сумма к списанию по всем платежам "куска" (части группы, идущей
// в одну транзакцию).
export function chunkBilled(chunk: Chunk): number {
  return chunk.payments.reduce((s, p) => s + billedOf(p, chunk.group), 0);
}

/**
 * Подбор подмножества элементов (по их "весам", округлённым до рубля), сумма
 * которых максимально близка к target, не превышая cap:
 * - если существует подмножество с суммой в диапазоне [target, cap] —
 *   берём то, что даёт МИНИМАЛЬНОЕ превышение target (это позволяет как можно
 *   точнее упереться в target, не растрачивая лишние деньги сверх него);
 * - если такого нет (даже вся вместимость cap не дотягивает до target) —
 *   берём подмножество с МАКСИМАЛЬНОЙ суммой, не превышающей cap.
 *
 * Реализовано через классический 0/1 subset-sum: таблица reachable[i][c] —
 * "достижима ли сумма ровно c, используя первые i элементов".
 */
function pickClosestSubset(weights: number[], target: number, cap: number): number[] {
  const n = weights.length;
  if (n === 0) return [];
  if (!Number.isFinite(cap) || cap >= 1e9) {
    return Array.from({ length: n }, (_, i) => i);
  }
  const capInt = Math.max(0, Math.floor(cap));
  if (capInt <= 0) return [];

  const w = weights.map((x) => Math.max(0, Math.round(x)));

  // reachable[i][c] — можно ли получить сумму ровно c из первых i элементов.
  const reachable: boolean[][] = Array.from({ length: n + 1 }, () => new Array(capInt + 1).fill(false));
  reachable[0][0] = true;
  for (let i = 1; i <= n; i++) {
    const wi = w[i - 1];
    for (let c = 0; c <= capInt; c++) {
      reachable[i][c] = reachable[i - 1][c] || (c >= wi && reachable[i - 1][c - wi]);
    }
  }

  const targetInt = Math.max(0, Math.round(target));

  // Ищем минимальную достижимую сумму >= target (в пределах cap).
  let chosen = -1;
  for (let c = Math.min(targetInt, capInt); c <= capInt; c++) {
    if (reachable[n][c]) {
      chosen = c;
      break;
    }
  }
  // Если такой суммы нет — берём максимальную достижимую сумму <= target.
  if (chosen === -1) {
    for (let c = Math.min(targetInt, capInt); c >= 0; c--) {
      if (reachable[n][c]) {
        chosen = c;
        break;
      }
    }
  }
  if (chosen === -1) return []; // reachable[n][0] всегда true, сюда не попадём

  // Восстанавливаем набор элементов, идя по таблице в обратном порядке.
  let c = chosen;
  const idx: number[] = [];
  for (let i = n; i >= 1; i--) {
    if (reachable[i - 1][c]) {
      continue; // сумма c достижима и без элемента i — не берём его
    }
    idx.push(i - 1);
    c -= w[i - 1];
  }
  return idx.sort((a, b) => a - b);
}

/**
 * Подбор подмножества целых "кусков" (групп или их частей, оставшихся в пуле),
 * чья суммарная сумма к списанию максимально близка к target, не превышая cap.
 */
export function pickClosestChunks(chunks: Chunk[], target: number, cap: number): number[] {
  return pickClosestSubset(chunks.map(chunkBilled), target, cap);
}

/**
 * Подбор подмножества отдельных платежей одной группы, чья суммарная сумма
 * к списанию максимально близка к target, не превышая cap. Используется, чтобы
 * разбить группу, которая не помещается целиком.
 *
 * Возвращает индексы выбранных платежей (в порядке исходного массива payments).
 */
export function pickClosestPayments(payments: CleanPayment[], group: CleanGroup, target: number, cap: number): number[] {
  return pickClosestSubset(
    payments.map((p) => billedOf(p, group)),
    target,
    cap
  );
}
