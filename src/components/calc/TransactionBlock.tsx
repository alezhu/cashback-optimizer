// Одна транзакция внутри результата карты: список вошедших платежей,
// ставка комиссии, округление, доплата, копирование сумм и предупреждения.
import { useState } from 'react';
import { Copy, Check, AlertTriangle } from 'lucide-react';
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
  const mismatch = Math.abs(factBilledSum - roundedSum) > 0.01;
  // Предупреждение о нецелесообразной доплате
  const isHighIncrease = hasAdjust && cashback > 0 && increaseEntered >= cashback * 0.6;

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (key: string, amount: number) => {
    navigator.clipboard.writeText(amount.toFixed(2));
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((current) => (current === key ? null : current));
    }, 2000);
  };

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
            const origKey = `${p.id}-orig`;
            const adjKey = `${p.id}-adj`;
            const isOrigCopied = copiedKey === origKey;
            const isAdjCopied = copiedKey === adjKey;

            return (
              <tr key={p.id}>
                <td className="pname">{p.name}</td>
                <td className="pamount">
                  <div className="pamount-cell">
                    <span className="pamount-val">{fmt(p.amount)} ₽</span>
                    <button
                      className={`btn-copy btn-copy-icon ${isOrigCopied ? 'btn-copy-success' : ''}`}
                      onClick={() => copyToClipboard(origKey, p.amount)}
                      title={isOrigCopied ? 'Скопировано!' : 'Скопировать сумму в буфер обмена'}
                    >
                      {isOrigCopied ? <Check size={11} /> : <Copy size={11} />}
                    </button>
                  </div>
                </td>
                <td className="prate">
                  комиссия {rate}%{overridden ? ' (своя)' : ''} · {fmt(commissionAmount(p, group))} ₽
                </td>
                <td className="padjust">
                  {isAdjust && (
                    <span>
                      → ввести <b>{fmt(newAmt)} ₽</b> (+{fmt(increaseEntered)})
                      <button
                        className={`btn-copy ${isAdjCopied ? 'btn-copy-success' : ''}`}
                        onClick={() => copyToClipboard(adjKey, newAmt)}
                        title="Скопировать скорректированную сумму в буфер обмена"
                      >
                        {isAdjCopied ? <Check size={11} /> : <Copy size={11} />}
                        {isAdjCopied ? 'Скопировано' : 'Копировать'}
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {isHighIncrease && (
        <div className="tx-warning">
          <AlertTriangle size={13} />
          Доплата (+{fmt(increaseEntered)} ₽) составляет значительную часть кэшбека ({fmt(cashback)} ₽)
        </div>
      )}

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
