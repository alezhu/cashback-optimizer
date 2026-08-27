// Одна строка платежа внутри группы: чекбокс активности, название, сумма,
// чекбокс запрета увеличения, кнопка добавления индивидуальной комиссии и удаление.
import { Trash2, Percent } from 'lucide-react';
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
  // Переопределена ли комиссия для этого платежа
  const hasOverride =
    payment.commissionOverride !== null &&
    payment.commissionOverride !== undefined &&
    payment.commissionOverride !== '';

  const handleAddOverride = () => {
    onUpdate(payment.id, {
      commissionOverride: group.commission,
      roundCommissionOverride: group.roundCommission,
      minCommissionOverride: group.minCommission,
      maxCommissionOverride: group.maxCommission,
    });
  };

  const handleRemoveOverride = () => {
    onUpdate(payment.id, {
      commissionOverride: null,
      roundCommissionOverride: null,
      minCommissionOverride: null,
      maxCommissionOverride: null,
    });
  };

  return (
    <div className={`payment-container ${!isActive ? 'payment-container-inactive' : ''}`}>
      <div className="payment-row">
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
          type="checkbox"
          checked={payment.noIncrease === true}
          title={
            payment.noIncrease
              ? 'Увеличение суммы запрещено (сумма платежа зафиксирована и не будет увеличиваться при округлении)'
              : 'Разрешено увеличивать сумму платежа при округлении кэшбека'
          }
          onChange={(e) => onUpdate(payment.id, { noIncrease: e.target.checked })}
        />

        <div className="payment-actions">
          {!hasOverride && (
            <button
              className="btn btn-xs"
              onClick={handleAddOverride}
              title="Задать индивидуальные параметры комиссии для этого платежа"
            >
              <Percent size={11} /> Своя комиссия
            </button>
          )}
          <button className="btn-icon" onClick={() => onRemove(payment.id)} title="Удалить платёж">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {hasOverride && (
        <div className="payment-override-row">
          <label className="mini-field">
            Своя комиссия %
            <input
              type="number"
              className="input mono input-xs"
              value={payment.commissionOverride ?? ''}
              onChange={(e) => onUpdate(payment.id, { commissionOverride: parseFormNumber(e.target.value) })}
            />
          </label>

          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={payment.roundCommissionOverride ?? group.roundCommission}
              onChange={(e) => onUpdate(payment.id, { roundCommissionOverride: e.target.checked })}
            />
            округлять до целого
          </label>

          <label className="mini-field">
            Мин, ₽
            <input
              type="number"
              className="input mono input-sm"
              value={payment.minCommissionOverride ?? ''}
              onChange={(e) => onUpdate(payment.id, { minCommissionOverride: parseFormNumber(e.target.value) })}
            />
          </label>

          <label className="mini-field">
            Макс, ₽
            <input
              type="number"
              className="input mono input-sm"
              value={payment.maxCommissionOverride ?? ''}
              onChange={(e) => onUpdate(payment.id, { maxCommissionOverride: parseFormNumber(e.target.value) })}
            />
          </label>

          <button
            className="btn btn-xs btn-remove-override"
            onClick={handleRemoveOverride}
            title="Удалить индивидуальную комиссию и использовать настройки группы"
          >
            <Trash2 size={11} /> Удалить свою комиссию
          </button>
        </div>
      )}
    </div>
  );
}
