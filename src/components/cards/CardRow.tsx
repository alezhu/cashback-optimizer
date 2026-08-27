// Одна строка карты в списке: название, ставка кэшбека, лимит кэшбека,
// округление кэшбека, кнопки перемещения, дублирования и удаления.
import { ArrowUp, ArrowDown, Trash2, Copy, GripVertical } from 'lucide-react';
import type { Card, FormNumber } from '../../types';

interface CardRowProps {
  card: Card;
  index: number;
  onUpdate: (id: number, patch: Partial<Card>) => void;
  onRemove: (id: number) => void;
  onDuplicate: (id: number) => void;
  onMove: (index: number, dir: 1 | -1) => void;
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

export default function CardRow({
  card,
  index,
  onUpdate,
  onRemove,
  onDuplicate,
  onMove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragging,
  isDragOver,
}: CardRowProps) {
  const isActive = card.active !== false;

  return (
    <div
      className={`card-row ${!isActive ? 'card-row-inactive' : ''} ${isDragging ? 'dragging' : ''} ${
        isDragOver ? 'drag-over' : ''
      }`}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
    >
      <div
        className="drag-handle"
        draggable
        onDragStart={(e) => onDragStart(e, index)}
        onDragEnd={onDragEnd}
        title="Перетащите для изменения порядка"
      >
        <GripVertical size={15} />
      </div>

      <input
        type="checkbox"
        checked={isActive}
        title={isActive ? 'Карта активна (участвует в расчёте)' : 'Карта отключена (не используется в расчёте)'}
        onChange={(e) => onUpdate(card.id, { active: e.target.checked })}
      />

      {/* Порядок карт важен для алгоритма расчёта — двигаем вверх/вниз. */}
      <div className="move-btns">
        <button className="btn-icon up-down" onClick={() => onMove(index, -1)} title="Переместить выше">
          <ArrowUp size={13} />
        </button>
        <button className="btn-icon up-down" onClick={() => onMove(index, 1)} title="Переместить ниже">
          <ArrowDown size={13} />
        </button>
      </div>

      <input className="input" value={card.name} onChange={(e) => onUpdate(card.id, { name: e.target.value })} />
      <input
        type="number"
        className="input mono"
        value={card.rate}
        onChange={(e) => onUpdate(card.id, { rate: parseFormNumber(e.target.value) })}
      />
      <input
        type="number"
        className="input mono"
        placeholder="0 (без лимита)"
        title="Лимит кэшбека в месяц (0 или пусто = без лимита)"
        value={card.limit}
        onChange={(e) => onUpdate(card.id, { limit: parseFormNumber(e.target.value) })}
      />
      <input
        type="number"
        min={0}
        className="input mono"
        value={card.roundTo}
        placeholder="0"
        onChange={(e) => onUpdate(card.id, { roundTo: parseFormNumber(e.target.value) })}
      />

      <div className="card-actions">
        <button className="btn-icon" onClick={() => onDuplicate(card.id)} title="Дублировать карту">
          <Copy size={14} />
        </button>
        <button className="btn-icon" onClick={() => onRemove(card.id)} title="Удалить карту">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
