// Карточка одной группы: название, параметры комиссии группы (ставка,
// округление до целого, мин/макс) и разворачиваемый список платежей внутри неё.
import { ChevronDown, ChevronRight, Trash2, Plus } from 'lucide-react';
import PaymentRow from './PaymentRow';
import { fmt } from '../../utils/format';
import type { Group, Payment, FormNumber } from '../../types';

interface GroupPanelProps {
  group: Group;
  open: boolean;
  onToggle: (id: number) => void;
  updateGroup: (id: number, patch: Partial<Group>) => void;
  removeGroup: (id: number) => void;
  addPayment: (groupId: number) => void;
  updatePayment: (groupId: number, paymentId: number, patch: Partial<Payment>) => void;
  removePayment: (groupId: number, paymentId: number) => void;
}

function parseFormNumber(raw: string): FormNumber {
  return raw === '' ? '' : Number(raw);
}

export default function GroupPanel({
  group,
  open,
  onToggle,
  updateGroup,
  removeGroup,
  addPayment,
  updatePayment,
  removePayment,
}: GroupPanelProps) {
  // Сумма группы без учёта комиссии — просто для ориентира в свёрнутом виде.
  const total = group.payments.reduce((s, p) => s + (p.amount === '' ? 0 : p.amount), 0);

  return (
    <div className="group-panel">
      <div className="group-header" onClick={() => onToggle(group.id)}>
        {open ? (
          <span className="chev">
            <ChevronDown size={16} />
          </span>
        ) : (
          <span className="chev">
            <ChevronRight size={16} />
          </span>
        )}

        <input
          className="name-input"
          value={group.name}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => updateGroup(group.id, { name: e.target.value })}
        />

        {/* Базовая ставка комиссии группы — применяется ко всем её платежам,
            если у конкретного платежа не задано своё переопределение. */}
        <label className="mini-field" onClick={(e) => e.stopPropagation()}>
          Комиссия %
          <input
            type="number"
            className="input mono input-xs"
            value={group.commission}
            onChange={(e) => updateGroup(group.id, { commission: parseFormNumber(e.target.value) })}
          />
        </label>

        {/* Если включено — рассчитанная сумма комиссии каждого платежа группы
            округляется до целого рубля (Math.round). */}
        <label className="checkbox-field" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={group.roundCommission}
            onChange={(e) => updateGroup(group.id, { roundCommission: e.target.checked })}
          />
          округлять до целого
        </label>

        {/* Нижняя граница суммы комиссии на один платёж, ₽ (пусто — не ограничено). */}
        <label className="mini-field" onClick={(e) => e.stopPropagation()}>
          Мин, ₽
          <input
            type="number"
            className="input mono input-sm"
            value={group.minCommission}
            onChange={(e) => updateGroup(group.id, { minCommission: parseFormNumber(e.target.value) })}
          />
        </label>

        {/* Верхняя граница суммы комиссии на один платёж, ₽ (пусто — не ограничено). */}
        <label className="mini-field" onClick={(e) => e.stopPropagation()}>
          Макс, ₽
          <input
            type="number"
            className="input mono input-sm"
            value={group.maxCommission}
            onChange={(e) => updateGroup(group.id, { maxCommission: parseFormNumber(e.target.value) })}
          />
        </label>

        <span className="group-total">{fmt(total)} ₽</span>

        <button
          className="btn-icon"
          onClick={(e) => {
            e.stopPropagation();
            removeGroup(group.id);
          }}
        >
          <Trash2 size={15} />
        </button>
      </div>

      {open && (
        <div className="group-body">
          <div className="payment-row-header">
            <div>Название платежа</div>
            <div>Сумма, ₽</div>
            <div>Комиссия, % (своя)</div>
            <div></div>
          </div>

          {group.payments.map((p) => (
            <PaymentRow
              key={p.id}
              payment={p}
              group={group}
              onUpdate={(pid, patch) => updatePayment(group.id, pid, patch)}
              onRemove={(pid) => removePayment(group.id, pid)}
            />
          ))}

          <button className="btn" onClick={() => addPayment(group.id)}>
            <Plus size={12} /> Добавить платёж
          </button>
        </div>
      )}
    </div>
  );
}
