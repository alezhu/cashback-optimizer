// Вкладка «Расчёт»: настройка допустимого превышения, кнопка запуска расчёта
// и вывод результата по каждой карте + общий итог.
import { Calculator } from 'lucide-react';
import CardResult from './CardResult';
import { fmt } from '../../utils/format';
import type { CardAllocationResult, FormNumber } from '../../types';

interface CalcTabProps {
  tolerance: FormNumber;
  setTolerance: (v: FormNumber) => void;
  runCalc: () => void;
  results: CardAllocationResult[] | null;
}

export default function CalcTab({ tolerance, setTolerance, runCalc, results }: CalcTabProps) {
  // Общий итог по всем картам считаем прямо здесь — это чисто отображение,
  // сам расчёт распределения уже выполнен в allocationService.
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
      <div className="panel calc-toolbar">
        <label>
          Допустимое превышение суммы на карте, ₽
          <input
            type="number"
            className="input mono input-sm"
            value={tolerance}
            onChange={(e) => setTolerance(e.target.value === '' ? '' : Number(e.target.value))}
          />
        </label>
        <button className="btn btn-gold" style={{ marginLeft: 'auto' }} onClick={runCalc}>
          <Calculator size={16} /> Рассчитать
        </button>
      </div>

      {!results && <div className="panel-dashed">Нажмите «Рассчитать», чтобы разбить платежи по картам и транзакциям.</div>}

      {results && (
        <div>
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
