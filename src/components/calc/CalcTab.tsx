// Вкладка «Расчёт»: выбор алгоритма, кнопка запуска, вывод результатов по картам,
// финансовая аналитика (чистая выгода, комиссии, наценки), бенчмарк (vs 1%) и экспорт.
import { Calculator, Zap, Search, FileDown, TrendingUp } from 'lucide-react';
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
  // Финансовая аналитика и агрегаты
  const analytics = results
    ? (() => {
        let totalEntered = 0;
        let totalBilled = 0;
        let totalRounded = 0;
        let totalIncrease = 0;
        let totalCashback = 0;

        results.forEach((cr) => {
          const rawCb = cr.transactions.reduce((s, t) => s + t.cashback, 0);
          const cb = cr.card.limit > 0 ? Math.min(rawCb, cr.card.limit) : rawCb;
          totalCashback += cb;

          cr.transactions.forEach((tx) => {
            totalEntered += tx.enteredOriginal;
            totalBilled += tx.billedSum;
            totalRounded += tx.roundedSum;
            totalIncrease += tx.increaseEntered;
          });
        });

        const totalCommission = Math.max(0, totalBilled - totalEntered);
        const netProfit = totalCashback - totalCommission - totalIncrease;
        const benchmark1Pct = Math.floor(totalRounded * 0.01);
        const extraGain = totalCashback - benchmark1Pct;

        return {
          totalEntered,
          totalBilled,
          totalRounded,
          totalCommission,
          totalIncrease,
          totalCashback,
          netProfit,
          benchmark1Pct,
          extraGain,
        };
      })()
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
            ? 'Считает мгновенно. Подбирает оптимальные карты с наименьшей достаточной ёмкостью и минимизирует число карт.'
            : 'Точный алгоритм Branch & Bound. Находит глобально наилучшую комбинацию без подвисания интерфейса.'}
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

      {isCalculating && <div className="panel-dashed">Идёт расчёт в фоновом потоке — интерфейс остаётся отзывчивым…</div>}

      {results && !isCalculating && analytics && (
        <div>
          {mode === 'exact' && exactInfo && (
            <div className={`exact-badge ${exactInfo.optimal ? 'exact-badge-ok' : 'exact-badge-warn'}`}>
              {exactInfo.optimal
                ? `Найден доказанный максимум кэшбека (перебрано узлов: ${exactInfo.nodesExplored.toLocaleString('ru-RU')}).`
                : `Перебор остановлен по лимиту (${exactInfo.nodesExplored.toLocaleString(
                    'ru-RU'
                  )} узлов) — показан лучший найденный вариант.`}
            </div>
          )}

          {/* Бенчмарк-сравнение со стандартной 1% картой */}
          <div className="benchmark-banner">
            <div>
              <TrendingUp size={16} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 6 }} />
              Сравнение: оптимизация даёт <b>{fmt(analytics.totalCashback)} ₽</b> кэшбека против{' '}
              <b>{fmt(analytics.benchmark1Pct)} ₽</b> при оплате базовой картой 1%.
            </div>
            <div className="benchmark-extra">
              +{fmt(analytics.extraGain)} ₽ выгоды
            </div>
          </div>

          {/* Финансовая аналитика */}
          <div className="analytics-grid">
            <div className="analytics-card">
              <div className="analytics-card-title">Сумма платежей</div>
              <div className="analytics-card-value">{fmt(analytics.totalEntered)} ₽</div>
            </div>
            <div className="analytics-card">
              <div className="analytics-card-title">Комиссии</div>
              <div className="analytics-card-value rust">{fmt(analytics.totalCommission)} ₽</div>
            </div>
            <div className="analytics-card">
              <div className="analytics-card-title">Доплата за шаг</div>
              <div className="analytics-card-value">{fmt(analytics.totalIncrease)} ₽</div>
            </div>
            <div className="analytics-card">
              <div className="analytics-card-title">Кэшбек</div>
              <div className="analytics-card-value gold">{fmt(analytics.totalCashback)} ₽</div>
            </div>
            <div className="analytics-card">
              <div className="analytics-card-title">Чистая выгода</div>
              <div className={`analytics-card-value ${analytics.netProfit >= 0 ? 'green' : 'rust'}`}>
                {fmt(analytics.netProfit)} ₽
              </div>
            </div>
          </div>

          {results.map((r) => (
            <CardResult key={r.card.id} result={r} />
          ))}

          <div className="grand-total">
            <span>
              Сумма к списанию: <b>{fmt(analytics.totalRounded)} ₽</b>
            </span>
            <span>
              Итого кэшбек: <b className="cb">{fmt(analytics.totalCashback)} ₽</b>
            </span>
            <button
              className="btn"
              onClick={() => exportResultsToFile(results, mode)}
              title="Скачать результат расчёта в JSON-файл"
            >
              <FileDown size={14} /> Выгрузить результат
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
