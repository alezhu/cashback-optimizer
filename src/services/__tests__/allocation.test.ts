import { describe, it, expect } from 'vitest';
import { allocate } from '../allocationService';
import { exactAllocate } from '../exactAllocationService';
import { cleanCard, cleanGroup } from '../normalize';
import type { Card, Group } from '../../types';

// Тестовый набор данных с числовыми параметрами из реального сценария
// (названия карт, групп и платежей обезличены)
function createScenarioData(): { cards: Card[]; groups: Group[]; tolerance: number } {
  return {
    tolerance: 100,
    cards: [
      { id: 1, name: 'Карта 1', active: true, rate: 5, limit: 225, roundTo: 1 },
      { id: 2, name: 'Карта 2', active: true, rate: 5, limit: 1000, roundTo: 1 },
      { id: 29, name: 'Карта 3', active: true, rate: 5, limit: 1000, roundTo: 1 },
      { id: 3, name: 'Карта 4', active: true, rate: 5, limit: 0, roundTo: 1 },
    ],
    groups: [
      {
        id: 7,
        name: 'Группа 1',
        commission: 0,
        roundCommission: false,
        minCommission: '',
        maxCommission: '',
        payments: [
          { id: 8, name: 'Платёж 1.1', amount: 1994.31, commissionOverride: '' },
          { id: 9, name: 'Платёж 1.2', amount: 605.56, commissionOverride: '' },
          { id: 10, name: 'Платёж 1.3', amount: 250, commissionOverride: '' },
          { id: 11, name: 'Платёж 1.4', amount: 176.9, commissionOverride: '' },
          { id: 12, name: 'Платёж 1.5', amount: 105, commissionOverride: '' },
          { id: 13, name: 'Платёж 1.6', amount: 518.13, commissionOverride: '' },
          { id: 14, name: 'Платёж 1.7', amount: 847.01, commissionOverride: '' },
          { id: 15, name: 'Платёж 1.8', amount: 303.49, commissionOverride: '' },
          { id: 16, name: 'Платёж 1.9', amount: 488.22, commissionOverride: '' },
          { id: 30, name: 'Платёж 1.10', amount: 6, commissionOverride: '' },
        ],
      },
      {
        id: 17,
        name: 'Группа 2',
        commission: 1,
        roundCommission: true,
        minCommission: '',
        maxCommission: '',
        payments: [
          { id: 18, name: 'Платёж 2.1', amount: 0, commissionOverride: '' },
          { id: 19, name: 'Платёж 2.2', amount: 3721.18, commissionOverride: '' },
        ],
      },
      {
        id: 20,
        name: 'Группа 3',
        commission: 1,
        roundCommission: false,
        minCommission: '',
        maxCommission: '',
        payments: [{ id: 21, name: 'Платёж 3.1', amount: 5267.73, commissionOverride: '' }],
      },
      {
        id: 22,
        name: 'Группа 4',
        commission: 0,
        roundCommission: false,
        minCommission: '',
        maxCommission: '',
        payments: [
          { id: 23, name: 'Платёж 4.1', amount: 295, commissionOverride: '' },
          { id: 24, name: 'Платёж 4.2', amount: 1440.16, commissionOverride: '' },
          { id: 25, name: 'Платёж 4.3', amount: 674.86, commissionOverride: '' },
          { id: 26, name: 'Платёж 4.4', amount: 1127.57, commissionOverride: '' },
        ],
      },
      {
        id: 27,
        name: 'Группа 5',
        commission: 0,
        roundCommission: false,
        minCommission: '',
        maxCommission: '',
        payments: [{ id: 28, name: 'Платёж 5.1', amount: 40.86, commissionOverride: '' }],
      },
    ],
  };
}

function summarize(results: ReturnType<typeof allocate>) {
  let totalSum = 0;
  let totalCashback = 0;
  let cardsUsed = 0;

  results.forEach((cr) => {
    const rawCashback = cr.transactions.reduce((s, t) => s + t.cashback, 0);
    const cb = cr.card.limit > 0 ? Math.min(rawCashback, cr.card.limit) : rawCashback;
    const sum = cr.transactions.reduce((s, t) => s + t.roundedSum, 0);
    totalSum += sum;
    totalCashback += cb;
    if (cr.transactions.length > 0) {
      cardsUsed++;
    }
  });

  return { totalSum, totalCashback, cardsUsed };
}

describe('Allocation Algorithms on test scenario', () => {
  it('Heuristic allocate should achieve 900 ₽ cashback, 18000 ₽ sum on 1 card (Карта 2)', () => {
    const data = createScenarioData();
    const cleanCards = data.cards.map(cleanCard);
    const cleanGroups = data.groups.map(cleanGroup);

    const results = allocate(cleanCards, cleanGroups, data.tolerance);
    const { totalSum, totalCashback, cardsUsed } = summarize(results);

    expect(totalCashback).toBe(900);
    expect(totalSum).toBe(18000);
    expect(cardsUsed).toBe(1);
    expect(results[1].card.name).toBe('Карта 2');
    expect(results[1].transactions.length).toBe(5);
  });

  it('Exact exactAllocate should achieve 900 ₽ cashback, 18000 ₽ sum on 1 card (Карта 2)', () => {
    const data = createScenarioData();
    const cleanCards = data.cards.map(cleanCard);
    const cleanGroups = data.groups.map(cleanGroup);

    const { results, optimal } = exactAllocate(cleanCards, cleanGroups);
    const { totalSum, totalCashback, cardsUsed } = summarize(results);

    expect(optimal).toBe(true);
    expect(totalCashback).toBe(900);
    expect(totalSum).toBe(18000);
    expect(cardsUsed).toBe(1);
    expect(results[1].card.name).toBe('Карта 2');
    expect(results[1].transactions.length).toBe(5);
  });

  it('When Карта 1 is inactive (active: false), both Heuristic and Exact should give 900 ₽ cashback on Карта 2', () => {
    const data = createScenarioData();
    data.cards[0].active = false; // Отключаем первую карту

    const cleanCards = data.cards.map(cleanCard);
    const cleanGroups = data.groups.map(cleanGroup);

    // Эвристика
    const heurResults = allocate(cleanCards, cleanGroups, data.tolerance);
    const heurSummary = summarize(heurResults);
    expect(heurSummary.totalCashback).toBe(900);
    expect(heurSummary.totalSum).toBe(18000);
    expect(heurSummary.cardsUsed).toBe(1);
    expect(heurResults[0].transactions.length).toBe(0);
    expect(heurResults[1].transactions.length).toBe(5);

    // Полный перебор
    const { results: exactResults, optimal } = exactAllocate(cleanCards, cleanGroups);
    const exactSummary = summarize(exactResults);
    expect(optimal).toBe(true);
    expect(exactSummary.totalCashback).toBe(900);
    expect(exactSummary.totalSum).toBe(18000);
    expect(exactSummary.cardsUsed).toBe(1);
    expect(exactResults[0].transactions.length).toBe(0);
    expect(exactResults[1].transactions.length).toBe(5);
  });

  it('Card with limit: 0 (or limit: "") is treated as unlimited cashback (no cap)', () => {
    const cards = [
      { id: 1, name: 'Безлимитная карта 5%', active: true, rate: 5, limit: 0, roundTo: 1 },
    ];
    const groups = [
      {
        id: 1,
        name: 'Группа 1',
        commission: 0,
        roundCommission: false,
        minCommission: null,
        maxCommission: null,
        payments: [
          { id: 1, name: 'П1', amount: 50000, commissionOverride: null },
        ],
      },
    ];

    const heurResults = allocate(cards, groups, 100);
    const heurSummary = summarize(heurResults);
    // 5% от 50 000 ₽ = 2500 ₽ кэшбека (без ограничения лимитом!)
    expect(heurSummary.totalCashback).toBe(2500);
    expect(heurSummary.cardsUsed).toBe(1);

    const { results: exactResults } = exactAllocate(cards, groups);
    const exactSummary = summarize(exactResults);
    expect(exactSummary.totalCashback).toBe(2500);
    expect(exactSummary.cardsUsed).toBe(1);
  });

  it('Higher rate cards are prioritized before lower rate cards', () => {
    const cards = [
      { id: 1, name: 'Карта 5%', active: true, rate: 5, limit: 1000, roundTo: 1 },
      { id: 2, name: 'Карта 10%', active: true, rate: 10, limit: 500, roundTo: 1 },
    ];
    const groups = [
      {
        id: 1,
        name: 'Группа 1',
        commission: 0,
        roundCommission: false,
        minCommission: null,
        maxCommission: null,
        payments: [
          { id: 1, name: 'П1', amount: 5000, commissionOverride: null },
          { id: 2, name: 'П2', amount: 5000, commissionOverride: null },
        ],
      },
    ];

    const heurResults = allocate(cards, groups, 100);
    expect(heurResults[1].card.name).toBe('Карта 10%');
    expect(heurResults[1].transactions.length).toBe(1);
    expect(heurResults[1].transactions[0].cashback).toBe(500);

    const { results: exactResults } = exactAllocate(cards, groups);
    expect(exactResults[1].card.name).toBe('Карта 10%');
    expect(exactResults[1].transactions.length).toBe(1);
    expect(exactResults[1].transactions[0].cashback).toBe(500);
  });

  it('Spillover when active card limit is exceeded into second card', () => {
    const cards = [
      { id: 1, name: 'Карта 1', active: true, rate: 10, limit: 500, roundTo: 1 }, // cap = 5000 ₽
      { id: 2, name: 'Карта 2', active: true, rate: 10, limit: 500, roundTo: 1 }, // cap = 5000 ₽
    ];
    const groups = [
      {
        id: 1,
        name: 'Группа 1',
        commission: 0,
        roundCommission: false,
        minCommission: null,
        maxCommission: null,
        payments: [
          { id: 1, name: 'П1', amount: 4000, commissionOverride: null },
          { id: 2, name: 'П2', amount: 4000, commissionOverride: null },
        ],
      },
    ];

    const heurResults = allocate(cards, groups, 100);
    const heurSummary = summarize(heurResults);
    expect(heurSummary.totalCashback).toBe(800);
    expect(heurSummary.cardsUsed).toBe(2);

    const { results: exactResults } = exactAllocate(cards, groups);
    const exactSummary = summarize(exactResults);
    expect(exactSummary.totalCashback).toBe(800);
    expect(exactSummary.cardsUsed).toBe(2);
  });

  it('Works with empty cards and empty groups', () => {
    expect(allocate([], [], 100)).toEqual([]);
    expect(exactAllocate([], []).results).toEqual([]);
  });
});
