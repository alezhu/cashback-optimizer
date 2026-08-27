// Карточка одной группы: активность, название, комиссия, мин/макс, дублирование, Drag-and-Drop
// и список входящих платежей.
import { ChevronDown, ChevronRight, Trash2, Plus, Copy, GripVertical } from 'lucide-react';
import PaymentRow from './PaymentRow';
import { fmt } from '../../utils/format';
import type { Group, Payment, FormNumber } from '../../types';

interface GroupPanelProps {
  group: Group;
  open: boolean;
  index: number;
  onToggle: (id: number) => void;
  updateGroup: (id: number, patch: Partial<Group>) => void;
  removeGroup: (id: number) => void;
  duplicateGroup: (id: number) => void;
  addPayment: (groupId: number) => void;
  updatePayment: (groupId: number, paymentId: number, patch: Partial<Payment>) => void;
  removePayment: (groupId: number, paymentId: number) => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  onDragEnd: (e: React.DragEvent) => void;
  isDragging: boolean;
  isDragOver: boolean;
}

function parseFormNumber(raw: string): FormNumber {
  return raw === '' ? '' : Number(raw);
}

export default function GroupPanel({
  group,
  open,
  index,
  onToggle,
  updateGroup,
  removeGroup,
  duplicateGroup,
  addPayment,
  updatePayment,
  removePayment,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragging,
  isDragOver,
}: GroupPanelProps) {
  const isActive = group.active !== false;
  // Сумма группы по активным платежам
  const total = group.payments
    .filter((p) => p.active !== false)
    .reduce((s, p) => s + (p.amount === '' ? 0 : p.amount), 0);

  return (
    <div
      className={`group-panel ${!isActive ? 'group-panel-inactive' : ''} ${isDragging ? 'dragging' : ''} ${
        isDragOver ? 'drag-over' : ''
      }`}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
    >
      <div className="group-header" onClick={() => onToggle(group.id)}>
        <div className="group-header-main">
          <div
            className="drag-handle"
            draggable
            onClick={(e) => e.stopPropagation()}
            onDragStart={(e) => onDragStart(e, index)}
            onDragEnd={onDragEnd}
            title="Перетащите для изменения порядка групп"
          >
            <GripVertical size={16} />
          </div>

          <input
            type="checkbox"
            checked={isActive}
            title={isActive ? 'Группа активна (включена в расчёт)' : 'Группа отключена (не участвует в расчёте)'}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => updateGroup(group.id, { active: e.target.checked })}
          />

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
            placeholder="Название группы"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => updateGroup(group.id, { name: e.target.value })}
          />

          <span className="group-total">{fmt(total)} ₽</span>

          <button
            className="btn-icon"
            title="Дублировать группу"
            onClick={(e) => {
              e.stopPropagation();
              duplicateGroup(group.id);
            }}
          >
            <Copy size={15} />
          </button>

          <button
            className="btn-icon"
            title="Удалить группу"
            onClick={(e) => {
              e.stopPropagation();
              removeGroup(group.id);
            }}
          >
            <Trash2 size={15} />
          </button>
        </div>

        {/* Вторая строка: параметры комиссии группы */}
        <div className="group-header-sub" onClick={(e) => e.stopPropagation()}>
          <label className="mini-field">
            Комиссия %
            <input
              type="number"
              className="input mono input-xs"
              value={group.commission}
              onChange={(e) => updateGroup(group.id, { commission: parseFormNumber(e.target.value) })}
            />
          </label>

          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={group.roundCommission}
              onChange={(e) => updateGroup(group.id, { roundCommission: e.target.checked })}
            />
            округлять до целого
          </label>

          <label className="mini-field">
            Мин, ₽
            <input
              type="number"
              className="input mono input-sm"
              value={group.minCommission}
              onChange={(e) => updateGroup(group.id, { minCommission: parseFormNumber(e.target.value) })}
            />
          </label>

          <label className="mini-field">
            Макс, ₽
            <input
              type="number"
              className="input mono input-sm"
              value={group.maxCommission}
              onChange={(e) => updateGroup(group.id, { maxCommission: parseFormNumber(e.target.value) })}
            />
          </label>
        </div>
      </div>

      {open && (
        <div className="group-body">
          <div className="payment-row-header">
            <div title="Активность">Вкл</div>
            <div>Название платежа</div>
            <div>Сумма, ₽</div>
            <div title="Запрет увеличения суммы платежа при округлении кэшбека">Фикс.</div>
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
