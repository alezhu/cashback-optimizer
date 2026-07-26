// Персистентность в IndexedDB — чтобы введённые карты/группы/платежи
// переживали перезагрузку страницы. Используем небольшую библиотеку "idb"
// (тонкая типизированная обёртка над нативным IndexedDB API).
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { PersistedState } from '../types';

interface AppDB extends DBSchema {
  state: {
    key: string;
    value: PersistedState;
  };
}

const DB_NAME = 'cashback-optimizer';
const DB_VERSION = 1;
const STORE = 'state';
// Всё состояние приложения хранится под одним фиксированным ключом — это не
// "таблица записей", а просто снапшот текущих данных пользователя.
const KEY = 'app-state';

let dbPromise: Promise<IDBPDatabase<AppDB>> | null = null;

function getDB(): Promise<IDBPDatabase<AppDB>> {
  if (!dbPromise) {
    dbPromise = openDB<AppDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      },
    });
  }
  return dbPromise;
}

/** Загружает сохранённое состояние. undefined — если в базе ещё ничего нет. */
export async function loadState(): Promise<PersistedState | undefined> {
  const db = await getDB();
  return db.get(STORE, KEY);
}

/** Полностью перезаписывает сохранённое состояние. */
export async function saveState(state: PersistedState): Promise<void> {
  const db = await getDB();
  await db.put(STORE, state, KEY);
}

/** Удаляет сохранённое состояние (например, кнопка "сбросить данные"). */
export async function clearState(): Promise<void> {
  const db = await getDB();
  await db.delete(STORE, KEY);
}
