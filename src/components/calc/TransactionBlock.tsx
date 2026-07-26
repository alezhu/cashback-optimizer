// Одна транзакция внутри результата карты: список вошедших платежей (с их
// эффективной ставкой комиссии), суммы до/после комиссии, округление и то, какой
// платёж и на сколько нужно увеличить, чтобы получить округлённую сумму.
import { fmt } from '../../utils/format';
import { paymentCommissionRate, isRateOverridden, commissionAmount } from '../../services/calcService';
import type { TransactionResult } from '../../types';

interface TransactionBlockProps {
  tx: TransactionResult;
  index: number;
}

export default function TransactionBlock({ tx, index }: TransactionBlockProps) {
  const { group, payments, adjustIdx, enteredOriginal, billedSum, roundedSum, increaseEntered, factBilledSum, cashback } = tx;
  const hasAdjust = Math.abs(increaseEntered) > 0.001;
  // Если после округления комиссии/применения min-max факт разошёлся с целевой
  // округлённой суммой — предупреждаем в интерфейсе вместо того, чтобы молча
  // показать неточный результат.
  const mismatch = Math.abs(factBilledSum - roundedSum) > 0.01;

  return (
    <div className="tx-block">
      <div className="tx-head">
        <span className="name">
          Транзакция {index + 1} — {tx.groupName}
        </span>
        <span className="cashback">кэшбек {fmt(cashback)} ₽</span>
      </div>

      <table className="tx-table">
        <tbody>
          {payments.map((p, pi) => {
            const rate = paymentCommissionRate(p, group);
            const overridden = isRateOverridden(p);
            const isAdjust = pi === adjustIdx && hasAdjust;
            const newAmt = isAdjust ? p.amount + increaseEntered : p.amount;
            return (
              <tr key={p.id}>
                <td className="pname">{p.name}</td>
                <td className="pamount">{fmt(p.amount)} ₽</td>
                <td className="prate">
                  {rate}%{overridden ? ' (своя)' : ''} · комиссия {fmt(commissionAmount(p, group))} ₽
                </td>
                <td className="padjust">{isAdjust ? `→ ввести ${fmt(newAmt)} ₽ (+${fmt(increaseEntered)})` : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="tx-footer">
        <span>
          Введено: <b>{fmt(enteredOriginal)} ₽</b>
        </span>
        <span>
          После комиссии: <b>{fmt(billedSum)} ₽</b>
        </span>
        <span>
          Округлено до: <b>{fmt(roundedSum)} ₽</b>
        </span>
        {mismatch && (
          <span className="warn">
            факт. после увеличения: {fmt(factBilledSum)} ₽ — не совпадает точно из-за округления/лимитов комиссии
          </span>
        )}
      </div>
    </div>
  );
}
