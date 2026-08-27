// Корневой компонент приложения: хранит всё состояние (карты, группы, платежи,
// настройки и результат расчёта) и раздаёт его вкладкам. Вся мутирующая логика
// (добавить/удалить/изменить карту, группу, платёж) живёт здесь и передаётся
// вниз через пропсы — сами вкладки и их элементы состояния не хранят.
//
// Персистентность: при первом монтировании пытаемся загрузить сохранённое
// состояние из IndexedDB; если там ничего нет — используем стартовые данные
// (seed). После этого любое изменение cards/groups/tolerance сохраняется
// обратно в IndexedDB — так данные переживают перезагрузку страницы.
import { useEffect, useState } from 'react';
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
  const [cards, setCards] = useState<Card[]>(seedCards);
  const [groups, setGroups] = useState<Group[]>(seedGroups);
  // Допустимое превышение целевой суммы карты, ₽ (см. allocationService.allocate).
  const [tolerance, setTolerance] = useState<FormNumber>(100);
  // Какой алгоритм использовать: быстрая эвристика или полный перебор.
  const [mode, setMode] = useState<CalcMode>('heuristic');
  // Результат последнего расчёта (null, пока расчёт ни разу не запускали).
  const [results, setResults] = useState<CardAllocationResult[] | null>(null);
  // Идёт ли сейчас расчёт (актуально для полного перебора — он может занять
  // заметное время, и хочется успеть показать индикатор перед тем, как
  // синхронный перебор заблокирует поток).
  const [isCalculating, setIsCalculating] = useState(false);
  // Доп. информация о последнем расчёте полным перебором: доказан ли найденный
  // результат как максимум, и сколько узлов перебора это заняло.
  const [exactInfo, setExactInfo] = useState<{ optimal: boolean; nodesExplored: number } | null>(null);
  // Какие группы сейчас развёрнуты во вкладке «Группы» (по умолчанию — все).
  const [openGroups, setOpenGroups] = useState<Set<number>>(() => new Set(groups.map((g) => g.id)));
  // Пока не завершилась первая попытка чтения из IndexedDB, не пишем в неё —
  // иначе стартовые (seed) данные могли бы затереть реально сохранённые.
  const [loaded, setLoaded] = useState(false);

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
        }
        setLoaded(true);
      })
      .catch(() => {
        // IndexedDB недоступен (приватный режим, старый браузер и т.п.) —
        // просто работаем со стартовыми данными без персистентности.
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
    saveState(state).catch(() => {
      // Молча игнорируем ошибку сохранения — это не должно ломать интерфейс.
    });
  }, [cards, groups, tolerance, loaded]);

  // ---------- карты ----------
  const updateCard = (id: number, patch: Partial<Card>) =>
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const addCard = () => setCards((cs) => [...cs, { id: nextId(), name: `Карта ${cs.length + 1}`, active: true, rate: 10, limit: 1000, roundTo: 0 }]);
  const removeCard = (id: number) => setCards((cs) => cs.filter((c) => c.id !== id));
  // Перемещение карты вверх/вниз по списку — порядок важен для алгоритма
  // распределения (последняя карта в списке — "остаточная").
  const moveCard = (idx: number, dir: 1 | -1) =>
    setCards((cs) => {
      const arr = [...cs];
      const j = idx + dir;
      if (j < 0 || j >= arr.length) return arr;
      [arr[idx], arr[j]] = [arr[j], arr[idx]];
      return arr;
    });

  // ---------- группы ----------
  const addGroup = () => {
    const g: Group = {
      id: nextId(),
      name: `Группа ${groups.length + 1}`,
      commission: 0,
      roundCommission: false,
      minCommission: '',
      maxCommission: '',
      payments: [],
    };
    setGroups((gs) => [...gs, g]);
    setOpenGroups((s) => new Set([...s, g.id])); // новая группа сразу развёрнута
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

  // ---------- платежи внутри групп ----------
  // commissionOverride по умолчанию пустой — платёж наследует комиссию группы,
  // пока пользователь явно не задаст свою ставку.
  const addPayment = (groupId: number) =>
    setGroups((gs) =>
      gs.map((g) =>
        g.id === groupId
          ? {
              ...g,
              payments: [
                ...g.payments,
                { id: nextId(), name: `Платёж ${g.payments.length + 1}`, amount: 0, commissionOverride: '' },
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
    // Формы хранят числовые поля как number | '' — здесь приводим всё к строгим
    // числовым типам (normalize.ts) перед передачей в чистый сервис расчёта.
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

    // Полный перебор может занять заметное время и синхронно заблокирует
    // поток — сначала показываем индикатор "Считаю…", а сам перебор
    // запускаем следующим тиком, чтобы React успел его отрисовать.
    setIsCalculating(true);
    setTab('calc');
    setTimeout(() => {
      const { results: res, optimal, nodesExplored } = exactAllocate(cleanCards, cleanGroups);
      setExactInfo({ optimal, nodesExplored });
      setResults(res);
      setIsCalculating(false);
    }, 30);
  };

  // ---------- экспорт / импорт ----------
  const getExportState = (): PersistedState => ({ version: STATE_VERSION, cards, groups, tolerance });

  const handleImport = (state: PersistedState) => {
    syncIdCounter(state.cards, state.groups);
    setCards(state.cards);
    setGroups(state.groups);
    setTolerance(state.tolerance);
    setOpenGroups(new Set(state.groups.map((g) => g.id)));
    setResults(null); // старый расчёт больше не соответствует новым данным
    setExactInfo(null);
  };

  return (
    <div className="app">
      <div className="header">
        <div>
          <h1>Раскладка платежей по картам</h1>
          <p>Максимизация кэшбека при оплате несколькими картами</p>
        </div>
        <div className="badge">v{__APP_VERSION__}</div>
      </div>

      <DataToolbar getState={getExportState} onImport={handleImport} />

      <Tabs tab={tab} setTab={setTab} />

      {tab === 'cards' && (
        <CardsTab cards={cards} updateCard={updateCard} addCard={addCard} removeCard={removeCard} moveCard={moveCard} />
      )}

      {tab === 'groups' && (
        <GroupsTab
          groups={groups}
          openGroups={openGroups}
          toggleGroup={toggleGroup}
          addGroup={addGroup}
          removeGroup={removeGroup}
          updateGroup={updateGroup}
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
