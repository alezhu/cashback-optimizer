// Экспорт текущих данных в JSON-файл и импорт данных из ранее выгруженного файла.
import type { PersistedState, CardAllocationResult, CalcMode } from '../types';

/** Скачивает переданное состояние как .json-файл (стандартный трюк с <a download>). */
export function exportStateToFile(state: PersistedState, filename = 'cashback-data.json'): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Выгружает результат расчёта кэшбека в JSON-файл.
 *
 * Структура файла:
 *   generatedAt  — ISO-метка времени генерации
 *   algorithm    — 'heuristic' | 'exact'
 *   grandTotal   — итоговые суммы по всем картам
 *   cards[]      — по одному объекту на карту:
 *     name, rate, limitCashback — реквизиты карты
 *     total — суммы по карте с учётом лимита
 *     transactions[] — транзакции внутри карты:
 *       group, payments[], billedSum, roundedSum,
 *       increaseEntered (> 0 если нужно увеличить платёж для кратного кэшбека),
 *       cashback
 */
export function exportResultsToFile(
  results: CardAllocationResult[],
  mode: CalcMode,
  filename = 'cashback-result.json',
): void {
  // Считаем итоги по каждой карте и по всем вместе.
  let grandSum = 0;
  let grandCashback = 0;

  const cards = results.map((cr) => {
    const rawCashback = cr.transactions.reduce((s, t) => s + t.cashback, 0);
    const cashback = cr.card.limit > 0 ? Math.min(rawCashback, cr.card.limit) : rawCashback;
    const sum = cr.transactions.reduce((s, t) => s + t.roundedSum, 0);
    grandSum += sum;
    grandCashback += cashback;

    return {
      name: cr.card.name,
      rate: cr.card.rate,
      limitCashback: cr.card.limit > 0 ? cr.card.limit : null,
      roundTo: cr.card.roundTo > 0 ? cr.card.roundTo : null,
      total: {
        sumRounded: sum,
        cashbackRaw: rawCashback,
        cashback,
        cashbackCapped: cr.card.limit > 0 && rawCashback > cr.card.limit,
      },
      transactions: cr.transactions.map((tx, idx) => ({
        index: idx + 1,
        group: tx.groupName,
        payments: tx.payments.map((p) => ({
          name: p.name,
          amount: p.amount,
          commissionOverride: p.commissionOverride,
        })),
        enteredOriginal: tx.enteredOriginal,
        billedSum: tx.billedSum,
        roundedSum: tx.roundedSum,
        ...(Math.abs(tx.increaseEntered) > 0.001
          ? {
              adjustPayment: tx.payments[tx.adjustIdx]?.name ?? null,
              increaseEntered: tx.increaseEntered,
            }
          : {}),
        cashback: tx.cashback,
      })),
    };
  });

  const output = {
    generatedAt: new Date().toISOString(),
    algorithm: mode,
    grandTotal: {
      sumRounded: grandSum,
      cashback: grandCashback,
    },
    cards,
  };

  const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Разбирает текст импортированного файла и минимально проверяет форму данных —
 * чтобы явно сообщить пользователю об ошибке, а не молча сломать приложение
 * кривым файлом.
 */
export function parseImportedState(text: string): PersistedState {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Файл не является корректным JSON');
  }

  if (!data || typeof data !== 'object') {
    throw new Error('Некорректный формат файла');
  }
  const obj = data as Record<string, unknown>;

  if (!Array.isArray(obj.cards) || !Array.isArray(obj.groups)) {
    throw new Error('В файле должны быть поля "cards" и "groups" (массивы)');
  }

  const tolerance =
    typeof obj.tolerance === 'number' || obj.tolerance === '' ? (obj.tolerance as number | '') : 100;

  return {
    version: typeof obj.version === 'number' ? obj.version : 1,
    cards: obj.cards as PersistedState['cards'],
    groups: obj.groups as PersistedState['groups'],
    tolerance,
  };
}
