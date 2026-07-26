// Одна строка платежа внутри группы: название, сумма и необязательное
// переопределение ставки комиссии (если пусто — используется комиссия группы).
import { Trash2 } from 'lucide-react';
import type { Payment, Group, FormNumber } from '../../types';

interface PaymentRowProps {
  payment: Payment;
  group: Group;
  onUpdate: (id: number, patch: Partial<Payment>) => void;
  onRemove: (id: number) => void;
}

function parseFormNumber(raw: string): FormNumber {
  return raw === '' ? '' : Number(raw);
}

export default function PaymentRow({ payment, group, onUpdate, onRemove }: PaymentRowProps) {
  return (
    <div className="payment-row">
      <input className="input" value={payment.name} onChange={(e) => onUpdate(payment.id, { name: e.target.value })} />
      <input
        type="number"
        className="input mono"
        value={payment.amount}
        onChange={(e) => onUpdate(payment.id, { amount: parseFormNumber(e.target.value) })}
      />
      {/* placeholder показывает, какая комиссия применится по умолчанию (группы),
          если поле оставить пустым */}
      <input
        type="number"
        className="input mono"
        placeholder={`${group.commission === '' ? 0 : group.commission}%`}
        title="Переопределить комиссию группы для этого платежа (пусто = как в группе)"
        value={payment.commissionOverride}
        onChange={(e) => onUpdate(payment.id, { commissionOverride: parseFormNumber(e.target.value) })}
      />
      <button className="btn-icon" onClick={() => onRemove(payment.id)}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}
