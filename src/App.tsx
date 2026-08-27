// Корневой компонент приложения: хранит всё состояние (карты, группы, платежи,
// тему оформления, настройки и результат расчёта) и раздаёт его вкладкам.
import { useEffect, useState, useRef } from 'react';
import { Sun, Moon } from 'lucide-react';
import Tabs, { type TabId } from './components/Tabs';
import CardsTab from './components/cards/CardsTab';
import GroupsTab from './components/groups/GroupsTab';
import CalcTab from './components/calc/CalcTab';
import DataToolbar from './components/DataToolbar';
import { seedCards, seedGroups } from './data/seed';
import { nextId, syncIdCounter } from './utils/idGenerator';
import { allocate } from './services/allocationService';
import { exactAllocate } from './services/exactAllocationService';
import { cleanCard, cleanGroup } from './services/normalize';
import { loadState, saveState } from './services/db';
import type { Card, Group, Payment, FormNumber, CardAllocationResult, PersistedState, CalcMode } from './types';

const STATE_VERSION = 1;

export default function App() {
  const [tab, setTab] = useState<TabId>('cards');
  const [cards, setCards] = useState<Card[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  // Допустимое превышение целевой суммы карты, ₽ (см. allocationService.allocate).
  const [tolerance, setTolerance] = useState<FormNumber>(100);
  // Какой алгоритм использовать: быстрая эвристика или полный перебор.
  const [mode, setMode] = useState<CalcMode>('heuristic');
  // Результат последнего расчёта (null, пока расчёт ни разу не запускали).
  const [results, setResults] = useState<CardAllocationResult[] | null>(null);
  // Идёт ли сейчас расчёт
  const [isCalculating, setIsCalculating] = useState(false);
  // Доп. информация о последнем расчёте полным перебором
  const [exactInfo, setExactInfo] = useState<{ optimal: boolean; nodesExplored: number } | null>(null);
  // Какие группы сейчас развёрнуты во вкладке «Группы»
  const [openGroups, setOpenGroups] = useState<Set<number>>(() => new Set());
  // Пока не завершилась первая попытка чтения из IndexedDB, не пишем в неё
  const [loaded, setLoaded] = useState(false);

  // Тема оформления (тёмная / светлая)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('cashback-optimizer-theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });

  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('cashback-optimizer-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  };

  // ---------- загрузка сохранённого состояния при старте ----------
  useEffect(() => {
    let cancelled = false;
    loadState()
      .then((saved) => {
        if (cancelled) return;
        if (saved) {
          syncIdCounter(saved.cards, saved.groups);
          setCards(saved.cards);
          setGroups(saved.groups);
          setTolerance(saved.tolerance);
          setOpenGroups(new Set(saved.groups.map((g) => g.id)));
        } else {
          const initialCards = seedCards();
          const initialGroups = seedGroups();
          syncIdCounter(initialCards, initialGroups);
          setCards(initialCards);
          setGroups(initialGroups);
          setOpenGroups(new Set(initialGroups.map((g) => g.id)));
        }
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        const initialCards = seedCards();
        const initialGroups = seedGroups();
        syncIdCounter(initialCards, initialGroups);
        setCards(initialCards);
        setGroups(initialGroups);
        setOpenGroups(new Set(initialGroups.map((g) => g.id)));
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------- сохранение состояния при любом изменении ----------
  useEffect(() => {
    if (!loaded) return;
    const state: PersistedState = { version: STATE_VERSION, cards, groups, tolerance };
    saveState(state).catch(() => {});
  }, [cards, groups, tolerance, loaded]);

  // ---------- карты ----------
  const updateCard = (id: number, patch: Partial<Card>) =>
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const addCard = () =>
    setCards((cs) => [...cs, { id: nextId(), name: `Карта ${cs.length + 1}`, active: true, rate: 10, limit: 1000, roundTo: 0 }]);
  const removeCard = (id: number) => setCards((cs) => cs.filter((c) => c.id !== id));
  const duplicateCard = (id: number) =>
    setCards((cs) => {
      const idx = cs.findIndex((c) => c.id === id);
      if (idx === -1) return cs;
      const target = cs[idx];
      const copy: Card = {
        ...target,
        id: nextId(),
        name: `${target.name} (копия)`,
      };
      const arr = [...cs];
      arr.splice(idx + 1, 0, copy);
      return arr;
    });

  const moveCard = (idx: number, dir: 1 | -1) =>
    setCards((cs) => {
      const arr = [...cs];
      const j = idx + dir;
      if (j < 0 || j >= arr.length) return arr;
      [arr[idx], arr[j]] = [arr[j], arr[idx]];
      return arr;
    });

  const reorderCards = (startIndex: number, endIndex: number) => {
    if (startIndex === endIndex) return;
    setCards((cs) => {
      const arr = [...cs];
      const [removed] = arr.splice(startIndex, 1);
      arr.splice(endIndex, 0, removed);
      return arr;
    });
  };

  // ---------- группы ----------
  const addGroup = () => {
    const g: Group = {
      id: nextId(),
      name: `Группа ${groups.length + 1}`,
      active: true,
      commission: 0,
      roundCommission: false,
      minCommission: '',
      maxCommission: '',
      payments: [],
    };
    setGroups((gs) => [...gs, g]);
    setOpenGroups((s) => new Set([...s, g.id]));
  };
  const removeGroup = (id: number) => setGroups((gs) => gs.filter((g) => g.id !== id));
  const updateGroup = (id: number, patch: Partial<Group>) =>
    setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const toggleGroup = (id: number) =>
    setOpenGroups((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const duplicateGroup = (id: number) =>
    setGroups((gs) => {
      const idx = gs.findIndex((g) => g.id === id);
      if (idx === -1) return gs;
      const target = gs[idx];
      const newGroupId = nextId();
      const copy: Group = {
        ...target,
        id: newGroupId,
        name: `${target.name} (копия)`,
        payments: target.payments.map((p) => ({
          ...p,
          id: nextId(),
        })),
      };
      const arr = [...gs];
      arr.splice(idx + 1, 0, copy);
      setOpenGroups((s) => new Set([...s, newGroupId]));
      return arr;
    });

  const reorderGroups = (startIndex: number, endIndex: number) => {
    if (startIndex === endIndex) return;
    setGroups((gs) => {
      const arr = [...gs];
      const [removed] = arr.splice(startIndex, 1);
      arr.splice(endIndex, 0, removed);
      return arr;
    });
  };

  // ---------- платежи внутри групп ----------
  const addPayment = (groupId: number) =>
    setGroups((gs) =>
      gs.map((g) =>
        g.id === groupId
          ? {
              ...g,
              payments: [
                ...g.payments,
                { id: nextId(), name: `Платёж ${g.payments.length + 1}`, active: true, noIncrease: false, amount: 0, commissionOverride: '' },
              ],
            }
          : g
      )
    );
  const updatePayment = (groupId: number, pid: number, patch: Partial<Payment>) =>
    setGroups((gs) =>
      gs.map((g) => (g.id === groupId ? { ...g, payments: g.payments.map((p) => (p.id === pid ? { ...p, ...patch } : p)) } : g))
    );
  const removePayment = (groupId: number, pid: number) =>
    setGroups((gs) => gs.map((g) => (g.id === groupId ? { ...g, payments: g.payments.filter((p) => p.id !== pid) } : g)));

  // ---------- запуск расчёта ----------
  const runCalc = () => {
    const cleanCards = cards.map(cleanCard);
    const cleanGroups = groups.map(cleanGroup);

    if (mode === 'heuristic') {
      const toleranceNum = tolerance === '' ? 0 : tolerance;
      const res = allocate(cleanCards, cleanGroups, toleranceNum);
      setExactInfo(null);
      setResults(res);
      setTab('calc');
      return;
    }

    // Полный перебор через Web Worker (чтобы UI не блокировался)
    setIsCalculating(true);
    setTab('calc');

    try {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
      const worker = new Worker(new URL('./workers/exactAllocation.worker.ts', import.meta.url), { type: 'module' });
      workerRef.current = worker;

      worker.onmessage = (e) => {
        const { results: res, optimal, nodesExplored } = e.data;
        setExactInfo({ optimal, nodesExplored });
        setResults(res);
        setIsCalculating(false);
      };

      worker.onerror = () => {
        // Fallback на синхронный расчет
        const { results: res, optimal, nodesExplored } = exactAllocate(cleanCards, cleanGroups);
        setExactInfo({ optimal, nodesExplored });
        setResults(res);
        setIsCalculating(false);
      };

      worker.postMessage({ cards: cleanCards, groups: cleanGroups });
    } catch {
      // Fallback
      setTimeout(() => {
        const { results: res, optimal, nodesExplored } = exactAllocate(cleanCards, cleanGroups);
        setExactInfo({ optimal, nodesExplored });
        setResults(res);
        setIsCalculating(false);
      }, 30);
    }
  };

  // ---------- экспорт / импорт ----------
  const getExportState = (): PersistedState => ({ version: STATE_VERSION, cards, groups, tolerance });

  const handleImport = (state: PersistedState) => {
    syncIdCounter(state.cards, state.groups);
    setCards(state.cards);
    setGroups(state.groups);
    setTolerance(state.tolerance);
    setOpenGroups(new Set(state.groups.map((g) => g.id)));
    setResults(null);
    setExactInfo(null);
  };

  if (!loaded) {
    return (
      <div className="app">
        <div className="header">
          <div>
            <h1>Раскладка платежей по картам</h1>
            <p>Максимизация кэшбека при оплате несколькими картами</p>
          </div>
          <div className="header-actions">
            <button className="theme-toggle-btn" onClick={toggleTheme} title="Сменить тему оформления">
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
              {theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            </button>
            <div className="badge">v{__APP_VERSION__}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="header">
        <div>
          <h1>Раскладка платежей по картам</h1>
          <p>Максимизация кэшбека при оплате несколькими картами</p>
        </div>
        <div className="header-actions">
          <button className="theme-toggle-btn" onClick={toggleTheme} title="Сменить тему оформления">
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            {theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          </button>
          <div className="badge">v{__APP_VERSION__}</div>
        </div>
      </div>

      <DataToolbar getState={getExportState} onImport={handleImport} />

      <Tabs tab={tab} setTab={setTab} />

      {tab === 'cards' && (
        <CardsTab
          cards={cards}
          updateCard={updateCard}
          addCard={addCard}
          removeCard={removeCard}
          duplicateCard={duplicateCard}
          moveCard={moveCard}
          reorderCards={reorderCards}
        />
      )}

      {tab === 'groups' && (
        <GroupsTab
          groups={groups}
          openGroups={openGroups}
          toggleGroup={toggleGroup}
          addGroup={addGroup}
          removeGroup={removeGroup}
          duplicateGroup={duplicateGroup}
          updateGroup={updateGroup}
          reorderGroups={reorderGroups}
          addPayment={addPayment}
          updatePayment={updatePayment}
          removePayment={removePayment}
        />
      )}

      {tab === 'calc' && (
        <CalcTab
          mode={mode}
          setMode={setMode}
          tolerance={tolerance}
          setTolerance={setTolerance}
          runCalc={runCalc}
          results={results}
          isCalculating={isCalculating}
          exactInfo={exactInfo}
        />
      )}
    </div>
  );
}
