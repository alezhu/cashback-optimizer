// Одна строка платежа внутри группы: чекбокс активности, название, сумма
// и переопределение ставки комиссии.
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
  const isActive = payment.active !== false;

  return (
    <div className={`payment-row ${!isActive ? 'payment-row-inactive' : ''}`}>
      <input
        type="checkbox"
        checked={isActive}
        title={isActive ? 'Платёж активен (участвует в расчёте)' : 'Платёж отключен (не участвует в расчёте)'}
        onChange={(e) => onUpdate(payment.id, { active: e.target.checked })}
      />
      <input className="input" value={payment.name} onChange={(e) => onUpdate(payment.id, { name: e.target.value })} />
      <input
        type="number"
        className="input mono"
        value={payment.amount}
        onChange={(e) => onUpdate(payment.id, { amount: parseFormNumber(e.target.value) })}
      />
      <input
        type="number"
        className="input mono"
        placeholder={`${group.commission === '' ? 0 : group.commission}%`}
        title="Переопределить комиссию группы для этого платежа (пусто = как в группе)"
        value={payment.commissionOverride}
        onChange={(e) => onUpdate(payment.id, { commissionOverride: parseFormNumber(e.target.value) })}
      />
      <button className="btn-icon" onClick={() => onRemove(payment.id)} title="Удалить платёж">
        <Trash2 size={14} />
      </button>
    </div>
  );
}
