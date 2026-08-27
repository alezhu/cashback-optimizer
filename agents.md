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
4. **Доплата в платеже (`increaseEntered`)**:
   * Чтобы получить округленную сумму транзакции, система находит самый крупный платёж в транзакции (`adjustIdx`) и вычисляет необходимую надбавку к его исходной сумме с учетом производной комиссии $\frac{d(\text{entered})}{d(\text{billed})}$ (`marginalFactor`).
5. **Лимиты карт**:
   * Каждая карта имеет процентную ставку (`rate`) и месячный потолок кэшбека (`limit`). Сумма кэшбека по карте: $\min(\sum \text{cashback}_{\text{tx}}, \text{limit})$. Карта с `limit <= 0` дает 0 ₽ кэшбека.

---

## 2. Стек технологий и окружение

* **Фреймворк**: React 19 (`react`, `react-dom`)
* **Язык**: TypeScript 7.x (строгий режим)
* **Сборщик**: Vite 8 (`@vitejs/plugin-react`)
* **Тестирование**: Vitest 4.x
* **Иконки**: `lucide-react`
* **Хранилище**: `idb` (IndexedDB)
* **Пакетный менеджер**: `pnpm`

### Команды:
* `pnpm test` — запуск unit- и интеграционных тестов через Vitest.
* `pnpm run typecheck` — проверка типов через `tsc --noEmit`.
* `pnpm run build` — проверка типов + сборка в `dist/`.
* `pnpm run dev` — локальный сервер разработки Vite.
* `pnpm run preview` — запуск превью собранного бандла.

---

## 3. Архитектура типов (`src/types.ts`)

В проекте строго разделены типы слоя UI/хранилища и вычислительного слоя:

```
[UI / Form Input / IndexedDB / JSON]
  Payment { amount: number | '', commissionOverride: number | '' }
  Group   { commission: number | '', minCommission: number | '', ... }
  Card    { rate: number | '', limit: number | '', roundTo: number | '' }
        │
        │ normalize.ts (cleanCard, cleanGroup, cleanPayment)
        ▼
[Calculation Layer (Pure Math)]
  CleanPayment { amount: number, commissionOverride: number | null }
  CleanGroup   { commission: number, minCommission: number | null, ... }
  CleanCard    { rate: number, limit: number, roundTo: number }
```

---

## 4. Структура файлов и их ответственность

```
src/
├── types.ts                      # Единый источник всех типов интерфейса и расчетов
├── styles.css                    # Стилизация (темная тема, CSS-переменные)
├── App.tsx                       # Главный контейнер состояния, IndexedDB-эффекты, переключение табов
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
    │   ├── CardsTab.tsx          # Список карт, добавление, кнопки перемещения
    │   └── CardRow.tsx           # Редактирование параметров одной карты
    ├── groups/
    │   ├── GroupsTab.tsx         # Список групп
    │   ├── GroupPanel.tsx        # Аккордеон группы, настройки комиссий
    │   └── PaymentRow.tsx        # Строка платежа (название, сумма, override комиссии)
    └── calc/
        ├── CalcTab.tsx           # Запуск расчета, переключатель режимов, общий итог
        ├── CardResult.tsx        # Блок распределения по конкретной карте
        └── TransactionBlock.tsx  # Детализация одной транзакции (платежи, надбавка, кэшбек)
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
1. Группирует активные карты (`rate > 0` и `limit > 0`) по тарифным уровням (`rate` по убыванию).
2. **Внутри тарифа**:
   * **Стратегия 1 (Одиночная карта)**: Проверяет, влезает ли весь текущий пул платежей на одну карту тарифа. Если да — выбирает карту с наименьшей достаточной ёмкостью и отдаёт ей все платежи без дробления групп.
   * **Стратегия 2 (Упаковка по убыванию ёмкости)**: Если на одну карту всё не помещается, заполняет карты с наибольшим лимитом в первую очередь через 2-шаговый 0/1 Subset-Sum (`pickClosestChunks` $\to$ `pickClosestPayments`).
3. **Остаток**: Оставшиеся платежи уходят на остаточную карту (`limit <= 0` или последнюю).

### 5.4. Режим 2: Точный решатель (`exactAllocate` в `src/services/exactAllocationService.ts`)
Выполняет Branch & Bound поиск по дереву решений с многокритериальной функцией оценки:
1. **Функция оценки (Score)**:
   $$\text{Score} = \text{Cashback} - 10 \times (\text{CardsUsed} - 1) - 0.1 \times \text{TotalIncrease} - 1.0 \times \text{SplitGroups}$$
   Это гарантирует, что алгоритм не будет дробить платежи на 4 карты ради искусственных +1 ₽ от округлений.
2. **Seeding**: инициализируется результатом эвристики `allocate()`.
3. **Branching Order**: сначала перебирает уже открытые непустые карты (поощряя упаковку), затем пустые активные, а остаточные карты — только если суммарная емкость активных карт исчерпана.
4. **Symmetry Breaking**: First-Empty-Bin правило для идентичных пустых карт.
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
