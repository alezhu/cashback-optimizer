// Одна транзакция внутри результата карты: список вошедших платежей,
// ставка комиссии, округление, доплата, копирование сумм и предупреждения.
import { useState, Fragment } from 'react';
import { Copy, Check, AlertTriangle } from 'lucide-react';
import { fmt, fmtClipboard } from '../../utils/format';
import { paymentCommissionRate, isRateOverridden, commissionAmount, billedOf } from '../../services/calcService';
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
    navigator.clipboard.writeText(fmtClipboard(amount));
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
        <thead>
          <tr className="tx-table-head">
            <th className="th-name">Платёж</th>
            <th className="th-amount">Сумма</th>
            <th className="th-rate">Комиссия</th>
            <th className="th-billed" title="Сумма с учётом комиссии">С комиссией</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p, pi) => {
            const rate = paymentCommissionRate(p, group);
            const overridden = isRateOverridden(p);
            const commAmt = commissionAmount(p, group);
            const billedAmt = billedOf(p, group);
            const isAdjust = pi === adjustIdx && hasAdjust;
            const newAmt = isAdjust ? p.amount + increaseEntered : p.amount;
            const adjustedPayment = isAdjust ? { ...p, amount: newAmt } : p;
            const adjCommAmt = isAdjust ? commissionAmount(adjustedPayment, group) : 0;
            const adjBilledAmt = isAdjust ? billedOf(adjustedPayment, group) : 0;

            const origKey = `${p.id}-orig`;
            const billedKey = `${p.id}-billed`;
            const adjAmtKey = `${p.id}-adj-amt`;
            const adjBilledKey = `${p.id}-adj-billed`;

            const isOrigCopied = copiedKey === origKey;
            const isBilledCopied = copiedKey === billedKey;
            const isAdjAmtCopied = copiedKey === adjAmtKey;
            const isAdjBilledCopied = copiedKey === adjBilledKey;

            return (
              <Fragment key={p.id}>
                <tr className={isAdjust ? 'tx-has-adjust' : undefined}>
                  <td className="pname">{p.name}</td>
                  <td className="pamount">
                    <div className="pamount-cell">
                      <span className="pamount-val">{fmt(p.amount)} ₽</span>
                      <button
                        className={`btn-copy btn-copy-icon ${isOrigCopied ? 'btn-copy-success' : ''}`}
                        onClick={() => copyToClipboard(origKey, p.amount)}
                        title={isOrigCopied ? 'Скопировано!' : 'Скопировать исходную сумму в буфер обмена'}
                      >
                        {isOrigCopied ? <Check size={11} /> : <Copy size={11} />}
                      </button>
                    </div>
                  </td>
                  <td className="prate">
                    <span className="prate-val">
                      {rate}%{overridden ? ' (своя)' : ''} ({fmt(commAmt)} ₽)
                    </span>
                  </td>
                  <td className="pbilled">
                    <div className="pamount-cell">
                      <span className="pamount-val" title="Сумма с комиссией">
                        {fmt(billedAmt)} ₽
                      </span>
                      <button
                        className={`btn-copy btn-copy-icon ${isBilledCopied ? 'btn-copy-success' : ''}`}
                        onClick={() => copyToClipboard(billedKey, billedAmt)}
                        title={isBilledCopied ? 'Скопировано!' : 'Скопировать сумму с комиссией в буфер обмена'}
                      >
                        {isBilledCopied ? <Check size={11} /> : <Copy size={11} />}
                      </button>
                    </div>
                  </td>
                </tr>

                {isAdjust && (
                  <tr className="tx-adjust-row">
                    <td className="pname padjust-name">
                      <span className="padjust-badge">
                        ↳ доплата (+{fmt(increaseEntered)} ₽)
                      </span>
                    </td>
                    <td className="pamount padjust-amount">
                      <div className="pamount-cell">
                        <span className="padjust-prefix">ввести</span>
                        <span className="pamount-val padjust-val">{fmt(newAmt)} ₽</span>
                        <button
                          className={`btn-copy btn-copy-icon ${isAdjAmtCopied ? 'btn-copy-success' : ''}`}
                          onClick={() => copyToClipboard(adjAmtKey, newAmt)}
                          title={isAdjAmtCopied ? 'Скопировано!' : 'Скопировать скорректированную сумму в буфер обмена'}
                        >
                          {isAdjAmtCopied ? <Check size={11} /> : <Copy size={11} />}
                        </button>
                      </div>
                    </td>
                    <td className="prate padjust-rate">
                      <span className="prate-val">
                        {rate}%{overridden ? ' (своя)' : ''} ({fmt(adjCommAmt)} ₽)
                      </span>
                    </td>
                    <td className="pbilled padjust-billed">
                      <div className="pamount-cell">
                        <span className="pamount-val padjust-val" title="Сумма с комиссией от доплаты">
                          {fmt(adjBilledAmt)} ₽
                        </span>
                        <button
                          className={`btn-copy btn-copy-icon ${isAdjBilledCopied ? 'btn-copy-success' : ''}`}
                          onClick={() => copyToClipboard(adjBilledKey, adjBilledAmt)}
                          title={isAdjBilledCopied ? 'Скопировано!' : 'Скопировать сумму с комиссией от доплаты в буфер обмена'}
                        >
                          {isAdjBilledCopied ? <Check size={11} /> : <Copy size={11} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
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
