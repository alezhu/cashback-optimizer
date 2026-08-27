// Общие типы данных приложения.
//
// Есть два "слоя" типов:
// 1. Формы (Payment, Group, Card) — то, что хранится в состоянии React,
//    в IndexedDB и в JSON-экспорте. Числовые поля здесь могут быть пустой
//    строкой '' — это нормальное промежуточное состояние поля ввода, пока
//    пользователь его не заполнил (или явно очистил).
// 2. "Чистые" типы для расчёта (CleanPayment, CleanGroup, CleanCard) — те же
//    сущности, но все числовые поля гарантированно приведены к number|null.
//    Сервисы расчёта (calcService, allocationService) работают только с ними,
//    чтобы не разбираться с пустыми строками внутри арифметики.

/** Числовое поле формы: либо число, либо пустая строка (значение не введено). */
export type FormNumber = number | '';

/** Какой алгоритм распределения использовать при расчёте. */
export type CalcMode = 'heuristic' | 'exact';

// ---------- Формы ----------

export interface Payment {
  id: number;
  name: string;
  amount: FormNumber;
  /** Своя ставка комиссии для этого платежа. '' = использовать комиссию группы. */
  commissionOverride: FormNumber;
}

export interface Group {
  id: number;
  name: string;
  /** Базовая ставка комиссии группы, %. */
  commission: FormNumber;
  /** Округлять ли рассчитанную сумму комиссии платежа до целого рубля. */
  roundCommission: boolean;
  /** Нижняя граница суммы комиссии платежа, ₽ ('' = не ограничено). */
  minCommission: FormNumber;
  /** Верхняя граница суммы комиссии платежа, ₽ ('' = не ограничено). */
  maxCommission: FormNumber;
  payments: Payment[];
}

export interface Card {
  id: number;
  name: string;
  /** Ставка кэшбека, %. */
  rate: FormNumber;
  /** Лимит кэшбека по карте, ₽. */
  limit: FormNumber;
  /**
   * Кратность кэшбека, ₽. 0 = не используется (округление до 10 ₽).
   * Если задано, сумма транзакции округляется вверх до значения, при котором
   * кэшбек кратен этому числу рублей (шаг = roundTo * 100 / rate ₽).
   */
  roundTo: FormNumber;
}

// ---------- «Чистые» данные для расчёта ----------

export interface CleanPayment {
  id: number;
  name: string;
  amount: number;
  commissionOverride: number | null;
}

export interface CleanGroup {
  id: number;
  name: string;
  commission: number;
  roundCommission: boolean;
  minCommission: number | null;
  maxCommission: number | null;
  payments: CleanPayment[];
}

export interface CleanCard {
  id: number;
  name: string;
  rate: number;
  limit: number;
  /** Кратность кэшбека, ₽. 0 = не используется. */
  roundTo: number;
}

// ---------- Результат расчёта ----------

/** "Кусок" — часть (или вся) группа платежей, которая пойдёт в одну транзакцию. */
export interface Chunk {
  group: CleanGroup;
  payments: CleanPayment[];
}

export interface TransactionResult {
  group: CleanGroup;
  groupName: string;
  payments: CleanPayment[];
  /** Индекс платежа в payments, который увеличивается для округления суммы. */
  adjustIdx: number;
  /** Сумма, изначально введённая по всем платежам транзакции (без комиссии). */
  enteredOriginal: number;
  /** Сумма к списанию с учётом комиссии каждого платежа. */
  billedSum: number;
  /** Сумма к списанию, округлённая вверх до кратной 10 ₽. */
  roundedSum: number;
  /** На сколько нужно увеличить вводимую сумму "корректируемого" платежа. */
  increaseEntered: number;
  /** Фактическая сумма к списанию после применения увеличения (для проверки). */
  factBilledSum: number;
  /** Кэшбек по этой транзакции (без учёта общего лимита карты). */
  cashback: number;
}

export interface CardAllocationResult {
  card: CleanCard;
  transactions: TransactionResult[];
}

// ---------- Персистентность (IndexedDB / JSON-экспорт) ----------

export interface PersistedState {
  /** Версия схемы данных — на случай будущих миграций формата. */
  version: number;
  cards: Card[];
  groups: Group[];
  tolerance: FormNumber;
}
