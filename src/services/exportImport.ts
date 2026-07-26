// Экспорт текущих данных в JSON-файл и импорт данных из ранее выгруженного файла.
import type { PersistedState } from '../types';

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
