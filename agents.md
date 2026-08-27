# Технический справочник проекта Cashback Optimizer

> Документ предназначен для AI-агентов и разработчиков. Содержит исчерпывающую информацию об архитектуре, структуре данных, алгоритмах оптимизации и правилах работы с кодовой базой.

---

## 1. Суть проекта и решаемая задача

**Cashback Optimizer («Раскладка платежей по картам»)** — клиентское Single Page Application (SPA), решающее комбинаторную задачу оптимального распределения набора платежей (ЖКХ, услуги, налоги и др.), объединенных в группы, по банковским картам для **максимизации суммарного начисленного кэшбека**.

### Приоритеты оптимизации:
1. **Использовать карты с максимальной ставкой кэшбека** (10% $\to$ 5% $\to$ 1%).
2. **Минимизировать число задействованных карт** (упаковывать платежи в наименьшее число карт, не дробя их без необходимости).
3. **Минимизировать сумму переплаты** (не создавать искусственные транзакции ради копеечного округления).
4. **Сохранять целостность групп** (минимизировать дробление одной группы платежей на разные карты).

### Особенности предметной области:
1. **Группы и транзакции**: платежи объединяются в группы (поставщики/категории). Каждая группа (или ее часть), назначенная на карту, формирует отдельную банковскую транзакцию.
2. **Комиссии**:
   * Базовая ставка комиссии на уровне группы (`commission: %`).
   * Индивидуальное переопределение ставки на уровне конкретного платежа (`commissionOverride: %`).
   * Ограничения суммы комиссии на платеж: `minCommission` (₽) и `maxCommission` (₽).
   * Флаг `roundCommission`: округление суммы комиссии каждого платежа до целого рубля (`Math.round`).
   * Сумма к списанию: $\text{billed} = \text{amount} + \text{commission}$.
3. **Кратность кэшбека (`roundTo`)**:
   * Банки начисляют кэшбек только за полные шаги суммы (например, шаг 100 ₽ при ставке 1% дает 1 ₽ кэшбека, а остаток сгорает из-за `Math.floor`).
   * Шаг округления суммы: $\text{step} = \frac{\text{roundTo} \times 100}{\text{rate}}$.
   * Сумма транзакции к списанию округляется вверх до ближайшего кратного шага.
4. **Доплата в платеже (`increaseEntered`) и флаг запрета увеличения (`noIncrease`)**:
   * Чтобы получить округленную сумму транзакции, система находит самый крупный платёж в транзакции среди разрешённых (`noIncrease !== true`, `adjustIdx`) и вычисляет надбавку к его сумме с учетом производной комиссии $\frac{d(\text{entered})}{d(\text{billed})}$ (`marginalFactor`).
   * Если для всех платежей транзакции установлен флаг `noIncrease: true`, доплата не начисляется (`increaseEntered = 0`), а кэшбек рассчитывается по фактической сумме списания.
5. **Лимиты и активность карт**:
   * Каждая карта имеет флаг активности (`active: boolean`). Неактивная карта (`active === false`) полностью исключается из расчётов.
   * `limit` (₽) — месячный потолок кэшбека. Если `limit <= 0` (или поле пустое), карта считается **безлимитной** (кэшбек начисляется без ограничений). Если `limit > 0`, сумма кэшбека по карте: $\min(\sum \text{cashback}_{\text{tx}}, \text{limit})$.

---

## 2. Стек технологий и окружение

* **Фреймворк**: React 19 (`react`, `react-dom`)
* **Язык**: TypeScript 7.x (строгий режим)
* **Сборщик**: Vite 8 (`@vitejs/plugin-react`, `vite-plugin-pwa`)
* **Тестирование**: Vitest 4.x
* **Иконки**: `lucide-react`
* **Хранилище**: `idb` (IndexedDB)
* **Многопоточность**: Web Workers (фоновый перебор `exactAllocation.worker.ts`)
* **Пакетный менеджер**: `pnpm`

### Команды:
* `pnpm test` — запуск unit- и интеграционных тестов через Vitest.
* `pnpm run typecheck` — проверка типов через `tsc --noEmit`.
* `pnpm run build` — проверка типов + сборка в `dist/` (включая PWA и Service Worker).
* `pnpm run dev` — локальный сервер разработки Vite.
* `pnpm run preview` — запуск превью собранного бандла.

---

## 3. Архитектура типов (`src/types.ts`)

В проекте строго разделены типы слоя UI/хранилища и вычислительного слоя:

```
[UI / Form Input / IndexedDB / JSON]
  Payment { amount: number | '', commissionOverride: number | '', active?: boolean, noIncrease?: boolean }
  Group   { commission: number | '', minCommission: number | '', active?: boolean, ... }
  Card    { rate: number | '', limit: number | '', roundTo: number | '', active?: boolean }
        │
        │ normalize.ts (cleanCard, cleanGroup, cleanPayment)
        ▼
[Calculation Layer (Pure Math)]
  CleanPayment { amount: number, commissionOverride: number | null, active: boolean, noIncrease: boolean }
  CleanGroup   { commission: number, minCommission: number | null, active: boolean, ... }
  CleanCard    { rate: number, limit: number, roundTo: number, active: boolean }
```

---

## 4. Структура файлов и их ответственность

```
src/
├── types.ts                      # Единый источник всех типов интерфейса и расчетов
├── styles.css                    # Стилизация (тёмная и светлая темы, CSS-переменные)
├── App.tsx                       # Главный контейнер состояния, темы, IndexedDB-эффекты, переключение табов
│
├── workers/
│   └── exactAllocation.worker.ts # Фоновый Web Worker для точного решателя exactAllocate()
│
├── services/
│   ├── normalize.ts              # Конвертеры Card/Group/Payment -> CleanCard/CleanGroup/CleanPayment
│   ├── calcService.ts            # Арифметика комиссий (billedOf, marginalFactor) + 0/1 Subset-Sum DP
│   ├── allocationService.ts      # makeTransaction() и эвристический алгоритм allocate() (Bin Packing + DP)
│   ├── exactAllocationService.ts # Точный решатель exactAllocate() (Branch & Bound DFS с штрафами)
│   ├── db.ts                     # Слой работы с IndexedDB (cashback-optimizer / state / app-state)
│   ├── exportImport.ts           # Экспорт/импорт настроек и экспорт результатов расчетов в JSON
│   └── __tests__/
│       └── allocation.test.ts    # Тесты эвристики и точного решателя на реальных данных
│
├── utils/
│   ├── format.ts                 # fmt() — форматирование денежных чисел в локаль ru-RU (2 знака)
│   └── idGenerator.ts            # nextId(), ensureIdAbove(), syncIdCounter() — генератор уникальных числовых ID
│
├── data/
│   └── seed.ts                   # Стартовые карты и группы по умолчанию (если IndexedDB пуст)
│
└── components/
    ├── Tabs.tsx                  # Навигация («Карты», «Группы», «Расчёт»)
    ├── DataToolbar.tsx           # Кнопки экспорта/импорта конфигурации
    ├── InfoNote.tsx              # Информационный блок с иконкой
    ├── cards/
    │   ├── CardsTab.tsx          # Список карт, добавление, кнопки перемещения, Drag-and-Drop
    │   └── CardRow.tsx           # Редактирование параметров одной карты, дублирование, Drag Handle
    ├── groups/
    │   ├── GroupsTab.tsx         # Список групп, добавление, дублирование, Drag-and-Drop
    │   ├── GroupPanel.tsx        # Аккордеон группы, настройки комиссий, Drag Handle
    │   └── PaymentRow.tsx        # Строка платежа (название, сумма, override комиссии, активность)
    └── calc/
        ├── CalcTab.tsx           # Запуск расчета, аналитика (чистая выгода, комиссии), бенчмарк vs 1%
        ├── CardResult.tsx        # Блок распределения по конкретной карте
        └── TransactionBlock.tsx  # Детализация одной транзакции (платежи, копирование суммы, кэшбек)
```

---

## 5. Вычислительные алгоритмы в деталях

### 5.1. Комиссии и надбавка (`src/services/calcService.ts`)
* `paymentCommissionRate(p, g)` = `p.commissionOverride ?? g.commission`.
* `commissionAmount(p, g)` = расчет с подрезкой `[minCommission, maxCommission]` и округлением при `g.roundCommission`.
* `billedOf(p, g)` = `p.amount + commissionAmount(p, g)`.
* `marginalFactor(p, g)`:
  * Если `roundCommission === true` или комиссия зажата min/max лимитами $\to 1$.
  * Иначе $\to \frac{1}{1 + \text{rate}/100}$.

### 5.2. Формирование транзакции (`makeTransaction` в `src/services/allocationService.ts`)
* `billedSum` = сумма `billedOf` всех платежей транзакции.
* `roundedSum` (`computeRoundedSum`): если `card.roundTo > 0`, округляет `billedSum` вверх с шагом `roundTo * 100 / rate`.
* `adjustIdx`: индекс платежа с максимальным `amount`.
* `increaseEntered` = $\text{round2}((\text{roundedSum} - \text{billedSum}) \times \text{marginalFactor})$.
* `cashback` = $\lfloor \text{roundedSum} \times \frac{\text{card.rate}}{100} \rfloor$.

### 5.3. Режим 1: Эвристический алгоритм (`allocate` в `src/services/allocationService.ts`)
1. Фильтрует только активные карты (`card.active !== false` и `rate > 0`) и группирует их по тарифным уровням (`rate` по убыванию).
2. Для каждой карты ёмкость определяется:
   * При `limit > 0`: $\text{cap} = \frac{\text{limit} \times 100}{\text{rate}} + \text{tolerance}$.
   * При `limit <= 0`: $\text{cap} = \infty$ (безлимитная карта).
3. **Внутри тарифа**:
   * **Стратегия 1 (Одиночная карта)**: Проверяет, влезает ли весь текущий пул платежей на одну карту тарифа. Если да — выбирает карту с наименьшей достаточной ёмкостью и отдаёт ей все платежи без дробления групп.
   * **Стратегия 2 (Упаковка по убыванию ёмкости)**: Если на одну карту всё не помещается, заполняет карты с наибольшей ёмкостью в первую очередь через 2-шаговый 0/1 Subset-Sum (`pickClosestChunks` $\to$ `pickClosestPayments`).
4. **Остаток**: Оставшиеся платежи уходят на активную остаточную карту (неактивные карты никогда не используются).

### 5.4. Режим 2: Точный решатель (`exactAllocate` в `src/services/exactAllocationService.ts`)
Выполняет Branch & Bound поиск по дереву решений с многокритериальной функцией оценки:
1. **Функция оценки (Score)**:
   $$\text{Score} = \text{Cashback} - 10 \times (\text{CardsUsed} - 1) - 0.1 \times \text{TotalIncrease} - 1.0 \times \text{SplitGroups}$$
   Учитывает только активные карты (`active !== false`); кэшбек по карте с `limit <= 0` начисляется без ограничений.
2. **Seeding**: инициализируется результатом эвристики `allocate()`.
3. **Branching Order**: перебирает только активные карты — сначала уже открытые непустые карты (поощряя упаковку), затем пустые активные.
4. **Symmetry Breaking**: First-Empty-Bin правило для идентичных пустых активных карт.
5. **Tight Upper Bound**: отсекает ветки, где теоретический максимум кэшбека с учетом штрафов уже не превысит `bestScore`.

---

## 6. Персистентность и состояние

1. **IndexedDB**: база `cashback-optimizer`, хранилище `state`, ключ `app-state`.
2. **Синхронизация ID**: при загрузке/импорте обязателен `syncIdCounter(cards, groups)`.
3. **Экспорт / Импорт**: `exportStateToFile()` (`cashback-data.json`), `exportResultsToFile()` (`cashback-result.json`), `parseImportedState()`.

---

## 7. Инварианты и правила модификации кода

1. **Не ломать двухуровневую типизацию**: компоненты работают с `FormNumber`, математические сервисы — с `Clean*`.
2. **Единая логика транзакций**: все алгоритмы обязаны использовать `makeTransaction()`.
3. **Проверка тестов**: любые правки алгоритмов должны проверяться через `pnpm test` и `pnpm run build`.
4. **Конвенция коммитов**: следовать спецификации Conventional Commits, атомарно группировать изменения, а релизы с `CHANGELOG.md` оформлять отдельным коммитом (см. `COMMIT_CONVENTION.md`).
