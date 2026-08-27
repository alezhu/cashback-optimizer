// Стартовые данные приложения (карты и группы платежей).
// Используются только при первом запуске, когда в IndexedDB ещё ничего не
// сохранено — дальше всё живёт в состоянии React и редактируется через интерфейс.
import { nextId } from '../utils/idGenerator';
import type { Card, Group, Payment } from '../types';

// Три карты с кэшбеком 10% и лимитом 1000 ₽ — как в исходном примере.
export function seedCards(): Card[] {
  return [
    { id: nextId(), name: 'Карта 1', active: true, rate: 10, limit: 1000, roundTo: 0 },
    { id: nextId(), name: 'Карта 2', active: true, rate: 10, limit: 1000, roundTo: 0 },
    { id: nextId(), name: 'Карта 3', active: true, rate: 10, limit: 1000, roundTo: 0 },
  ];
}

// Превращает массив сумм в массив объектов-платежей с дефолтными полями.
// commissionOverride: '' означает "использовать комиссию группы, своей ставки нет".
function makePayments(amounts: number[]): Payment[] {
  return amounts.map((a, i) => ({
    id: nextId(),
    name: `Платёж ${i + 1}`,
    amount: a,
    commissionOverride: '',
  }));
}

// Пять групп платежей из исходного примера пользователя.
export function seedGroups(): Group[] {
  return [
    {
      id: nextId(),
      name: 'Группа 1',
      commission: 0,
      roundCommission: false,
      minCommission: '',
      maxCommission: '',
      payments: makePayments([1998.84, 611.10, 250.00, 176.90, 105.00, 518.13, 847.01, 303.49, 488.22]),
    },
    {
      id: nextId(),
      name: 'Группа 2',
      commission: 1,
      roundCommission: false,
      minCommission: '',
      maxCommission: '',
      payments: makePayments([2211.35, 3722.09]),
    },
    {
      id: nextId(),
      name: 'Группа 3',
      commission: 1,
      roundCommission: false,
      minCommission: '',
      maxCommission: '',
      payments: makePayments([5699.99]),
    },
    {
      id: nextId(),
      name: 'Группа 4',
      commission: 0,
      roundCommission: false,
      minCommission: '',
      maxCommission: '',
      payments: makePayments([295.00, 1348.40, 674.86, 1127.57]),
    },
    {
      id: nextId(),
      name: 'Группа 5',
      commission: 0,
      roundCommission: false,
      minCommission: '',
      maxCommission: '',
      payments: makePayments([62.66]),
    },
  ];
}
