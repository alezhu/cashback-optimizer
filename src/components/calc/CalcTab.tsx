// Вкладка «Расчёт»: выбор алгоритма (эвристика/полный перебор), настройка
// допустимого превышения (только для эвристики), кнопка запуска расчёта
// и вывод результата по каждой карте + общий итог.
import { Calculator, Zap, Search, FileDown } from 'lucide-react';
import CardResult from './CardResult';
import { fmt } from '../../utils/format';
import { exportResultsToFile } from '../../services/exportImport';
import type { CardAllocationResult, FormNumber, CalcMode } from '../../types';

interface CalcTabProps {
  mode: CalcMode;
  setMode: (m: CalcMode) => void;
  tolerance: FormNumber;
  setTolerance: (v: FormNumber) => void;
  runCalc: () => void;
  results: CardAllocationResult[] | null;
  isCalculating: boolean;
  exactInfo: { optimal: boolean; nodesExplored: number } | null;
}

export default function CalcTab({
  mode,
  setMode,
  tolerance,
  setTolerance,
  runCalc,
  results,
  isCalculating,
  exactInfo,
}: CalcTabProps) {
  // Общий итог по всем картам считаем прямо здесь — это чисто отображение,
  // сам расчёт распределения уже выполнен в allocationService/exactAllocationService.
  const grandTotal = results
    ? results.reduce(
        (acc, r) => {
          const sum = r.transactions.reduce((s, t) => s + t.roundedSum, 0);
          const raw = r.transactions.reduce((s, t) => s + t.cashback, 0);
          const cashback = r.card.limit > 0 ? Math.min(raw, r.card.limit) : raw;
          return { sum: acc.sum + sum, cashback: acc.cashback + cashback };
        },
        { sum: 0, cashback: 0 }
      )
    : null;

  return (
    <div>
      <div className="panel calc-toolbar-wrap">
        <div className="mode-switch">
          <button
            className={`mode-btn ${mode === 'heuristic' ? 'mode-btn-active' : ''}`}
            onClick={() => setMode('heuristic')}
            disabled={isCalculating}
          >
            <Zap size={14} /> Эвристика — быстро
          </button>
          <button
            className={`mode-btn ${mode === 'exact' ? 'mode-btn-active' : ''}`}
            onClick={() => setMode('exact')}
            disabled={isCalculating}
          >
            <Search size={14} /> Полный перебор — максимум кэшбека
          </button>
        </div>

        <p className="mode-note">
          {mode === 'heuristic'
            ? 'Считает почти мгновенно. Подбирает состав транзакций по правдоподобному алгоритму — обычно очень близко к максимуму, но без гарантии.'
            : 'Перебирает варианты распределения платежей по картам, отсекая заведомо бесперспективные, и берёт лучший найденный. При большом числе платежей может считаться до нескольких секунд, а на очень больших наборах — упереться в лимит перебора и вернуть лучшее, что успел найти (это будет явно указано).'}
        </p>

        <div className="calc-toolbar">
          {mode === 'heuristic' && (
            <label>
              Допустимое превышение суммы на карте, ₽
              <input
                type="number"
                className="input mono input-sm"
                value={tolerance}
                onChange={(e) => setTolerance(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </label>
          )}
          <button className="btn btn-gold" style={{ marginLeft: 'auto' }} onClick={runCalc} disabled={isCalculating}>
            <Calculator size={16} /> {isCalculating ? 'Считаю…' : 'Рассчитать'}
          </button>
        </div>
      </div>

      {!results && !isCalculating && (
        <div className="panel-dashed">Нажмите «Рассчитать», чтобы разбить платежи по картам и транзакциям.</div>
      )}

      {isCalculating && <div className="panel-dashed">Идёт полный перебор вариантов — это может занять несколько секунд…</div>}

      {results && !isCalculating && (
        <div>
          {mode === 'exact' && exactInfo && (
            <div className={`exact-badge ${exactInfo.optimal ? 'exact-badge-ok' : 'exact-badge-warn'}`}>
              {exactInfo.optimal
                ? `Найден доказанный максимум кэшбека (перебрано узлов: ${exactInfo.nodesExplored.toLocaleString('ru-RU')}).`
                : `Перебор остановлен по лимиту (${exactInfo.nodesExplored.toLocaleString(
                    'ru-RU'
                  )} узлов) — показан лучший найденный вариант, он может быть не абсолютным максимумом.`}
            </div>
          )}

          {results.map((r) => (
            <CardResult key={r.card.id} result={r} />
          ))}

          {grandTotal && (
            <div className="grand-total">
              <span>
                Итого сумма: <b>{fmt(grandTotal.sum)} ₽</b>
              </span>
              <span>
                Итого кэшбек: <b className="cb">{fmt(grandTotal.cashback)} ₽</b>
              </span>
              <button
                className="btn"
                onClick={() => exportResultsToFile(results!, mode)}
                title="Скачать результат расчёта в JSON-файл"
              >
                <FileDown size={14} /> Выгрузить результат
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
