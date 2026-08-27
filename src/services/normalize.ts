// Преобразование "сырых" форм (Card/Group/Payment из состояния React, где
// числовые поля могут быть пустой строкой) в "чистые" типы для расчёта
// (CleanCard/CleanGroup/CleanPayment, где всё уже number|null).
import type { Card, Group, Payment, FormNumber, CleanCard, CleanGroup, CleanPayment } from '../types';

function toNumber(v: FormNumber | null | undefined, fallback = 0): number {
  if (v === '' || v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toNumberOrNull(v: FormNumber | null | undefined): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function cleanCard(card: Card): CleanCard {
  return {
    id: card.id,
    name: card.name,
    active: card.active !== false,
    rate: toNumber(card.rate),
    limit: toNumber(card.limit),
    // Старые сохранённые данные без поля roundTo дадут 0 (поведение не меняется).
    roundTo: toNumber(card.roundTo),
  };
}

export function cleanPayment(p: Payment): CleanPayment {
  return {
    id: p.id,
    name: p.name,
    active: p.active !== false,
    noIncrease: Boolean(p.noIncrease),
    amount: toNumber(p.amount),
    commissionOverride: p.commissionOverride !== undefined ? toNumberOrNull(p.commissionOverride) : null,
    roundCommissionOverride: typeof p.roundCommissionOverride === 'boolean' ? p.roundCommissionOverride : null,
    minCommissionOverride: p.minCommissionOverride !== undefined ? toNumberOrNull(p.minCommissionOverride) : null,
    maxCommissionOverride: p.maxCommissionOverride !== undefined ? toNumberOrNull(p.maxCommissionOverride) : null,
  };
}

export function cleanGroup(g: Group): CleanGroup {
  return {
    id: g.id,
    name: g.name,
    active: g.active !== false,
    commission: toNumber(g.commission),
    roundCommission: g.roundCommission,
    minCommission: toNumberOrNull(g.minCommission),
    maxCommission: toNumberOrNull(g.maxCommission),
    payments: g.payments.map(cleanPayment),
  };
}
