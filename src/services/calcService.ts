// Базовые расчёты по одному платежу: комиссия, сумма к списанию, метки clamp/override.
// Работает только с "чистыми" типами (CleanPayment/CleanGroup) — все числовые
// поля здесь уже гарантированно number|null, конвертация форм происходит в
// normalize.ts до вызова этих функций.
import type { CleanPayment, CleanGroup, Chunk } from '../types';

// Округление до копеек, устраняющее артефакты плавающей точки (0.1 + 0.2 и т.п.).
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Эффективная ставка комиссии для платежа: override платежа, иначе — комиссия группы. */
export function paymentCommissionRate(payment: CleanPayment, group: CleanGroup): number {
  return payment.commissionOverride ?? group.commission;
}

/** true, если платёж действительно использует свою ставку, а не ставку группы. */
export function isRateOverridden(payment: CleanPayment): boolean {
  return payment.commissionOverride !== null;
}

/** Сырая (до min/max/округления) сумма комиссии. */
function rawCommission(payment: CleanPayment, group: CleanGroup): number {
  const rate = paymentCommissionRate(payment, group);
  return payment.amount * (rate / 100);
}

/** true, если сумма комиссии была подрезана минимумом или максимумом группы. */
export function isCommissionClamped(payment: CleanPayment, group: CleanGroup): boolean {
  const amt = rawCommission(payment, group);
  if (group.minCommission !== null && amt < group.minCommission) return true;
  if (group.maxCommission !== null && amt > group.maxCommission) return true;
  return false;
}

/** Итоговая сумма комиссии по платежу с учётом override/min/max/округления. */
export function commissionAmount(payment: CleanPayment, group: CleanGroup): number {
  let amt = rawCommission(payment, group);
  if (group.minCommission !== null) amt = Math.max(amt, group.minCommission);
  if (group.maxCommission !== null) amt = Math.min(amt, group.maxCommission);
  if (group.roundCommission) amt = Math.round(amt);
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
 * - Если комиссия уже упирается в min/max группы, она не меняется при малом
 *   увеличении суммы — тоже фактор 1.
 * - Иначе комиссия линейна от суммы: фактор = 1 / (1 + ставка/100).
 */
export function marginalFactor(payment: CleanPayment, group: CleanGroup): number {
  if (group.roundCommission) return 1;
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
 * Рюкзак 0/1: выбрать подмножество платежей группы, чья суммарная сумма к списанию
 * максимальна, но не превышает capacityRub (в рублях, округление до целого —
 * приемлемое приближение, т.к. далее сумма всё равно округляется до 10 ₽).
 *
 * Возвращает индексы выбранных платежей (в порядке исходного массива payments).
 */
export function knapsackSelect(payments: CleanPayment[], group: CleanGroup, capacityRub: number): number[] {
  const n = payments.length;
  const cap = Math.max(0, Math.floor(capacityRub));
  if (cap <= 0 || n === 0) return [];

  // "Вес" каждого платежа для рюкзака — его сумма к списанию, округлённая до рубля.
  const weights = payments.map((p) => Math.max(0, Math.round(billedOf(p, group))));

  // dp[i][c] = максимальная сумма, которую можно набрать из первых i платежей
  // при ограничении по вместимости c рублей.
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(cap + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    const w = weights[i - 1];
    const prev = dp[i - 1];
    const row = dp[i];
    for (let c = 0; c <= cap; c++) {
      // Вариант "не берём платёж i" — наследуем значение без него.
      row[c] = prev[c];
      // Вариант "берём платёж i", если он помещается и даёт больший результат.
      if (w <= c && prev[c - w] + w > row[c]) row[c] = prev[c - w] + w;
    }
  }

  // Восстанавливаем набор выбранных платежей, идя по таблице dp в обратном порядке.
  let c = cap;
  const idx: number[] = [];
  for (let i = n; i >= 1; i--) {
    if (dp[i][c] !== dp[i - 1][c]) {
      idx.push(i - 1);
      c -= weights[i - 1];
    }
  }
  return idx.sort((a, b) => a - b);
}
