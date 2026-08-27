// Одна строка карты в списке: название, ставка кэшбека, лимит кэшбека,
// округление кэшбека, кнопки перемещения по списку и удаления.
import { ArrowUp, ArrowDown, Trash2 } from 'lucide-react';
import type { Card, FormNumber } from '../../types';

interface CardRowProps {
  card: Card;
  index: number;
  onUpdate: (id: number, patch: Partial<Card>) => void;
  onRemove: (id: number) => void;
  onMove: (index: number, dir: 1 | -1) => void;
}

// Инпуты с type="number" отдают строку — пустая строка означает "поле очищено",
// иначе приводим к числу.
function parseFormNumber(raw: string): FormNumber {
  return raw === '' ? '' : Number(raw);
}

export default function CardRow({ card, index, onUpdate, onRemove, onMove }: CardRowProps) {
  return (
    <div className="card-row">
      {/* Порядок карт важен для алгоритма расчёта — двигаем вверх/вниз. */}
      <div className="move-btns">
        <button className="btn-icon up-down" onClick={() => onMove(index, -1)}>
          <ArrowUp size={13} />
        </button>
        <button className="btn-icon up-down" onClick={() => onMove(index, 1)}>
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
      <button className="btn-icon" onClick={() => onRemove(card.id)}>
        <Trash2 size={15} />
      </button>
    </div>
  );
}
