// Генератор числовых id для карт/групп/платежей.
//
// Важно: при загрузке данных из IndexedDB или при импорте JSON нужно "поднять"
// счётчик выше максимального id, который уже встретился в загруженных данных —
// иначе новые сущности, созданные после загрузки, могут получить id, который
// уже занят, и что-то в состоянии перепутается.
import type { Card, Group } from '../types';

let uid = 1;

export function nextId(): number {
  return uid++;
}

/** Гарантирует, что следующий nextId() будет больше переданного id. */
export function ensureIdAbove(id: number): void {
  if (id >= uid) uid = id + 1;
}

/** Синхронизирует счётчик id со всеми id, встречающимися в карточках/группах/платежах. */
export function syncIdCounter(cards: Card[], groups: Group[]): void {
  cards.forEach((c) => ensureIdAbove(c.id));
  groups.forEach((g) => {
    ensureIdAbove(g.id);
    g.payments.forEach((p) => ensureIdAbove(p.id));
  });
}
