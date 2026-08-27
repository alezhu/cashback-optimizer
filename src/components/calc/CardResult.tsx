// Результат по одной карте: заголовок с итоговой суммой и кэшбеком (с учётом
// лимита карты) + список входящих в неё транзакций.
import { fmt } from '../../utils/format';
import TransactionBlock from './TransactionBlock';
import type { CardAllocationResult } from '../../types';

interface CardResultProps {
  result: CardAllocationResult;
}

export default function CardResult({ result }: CardResultProps) {
  const { card, transactions } = result;
  const rawCashback = transactions.reduce((s, t) => s + t.cashback, 0);
  const capped = card.limit > 0 && rawCashback > card.limit;
  const cashback = capped ? card.limit : rawCashback;
  const total = transactions.reduce((s, t) => s + t.roundedSum, 0);

  return (
    <div className={`card-result ${!card.active ? 'card-result-inactive' : ''}`}>
      <div className="card-result-header">
        <h3>
          {card.name}
          {!card.active && <span className="inactive-badge"> (отключена)</span>}
        </h3>
        <div className="card-result-stats">
          <span>
            Сумма: <b>{fmt(total)} ₽</b>
          </span>
          <span>
            Кэшбек: <b className="cb">{fmt(cashback)} ₽</b>
            {capped && <span className="capped-note">(лимит)</span>}
          </span>
        </div>
      </div>

      {transactions.length === 0 ? (
        <div className="tx-block">Нет транзакций</div>
      ) : (
        transactions.map((t, i) => <TransactionBlock key={i} tx={t} index={i} />)
      )}
    </div>
  );
}
