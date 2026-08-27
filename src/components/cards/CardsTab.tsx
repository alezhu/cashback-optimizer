// Вкладка «Карты»: таблица карт с редактированием, добавлением, дублированием и Drag-and-Drop.
import { useState } from 'react';
import { Plus } from 'lucide-react';
import CardRow from './CardRow';
import InfoNote from '../InfoNote';
import type { Card } from '../../types';

interface CardsTabProps {
  cards: Card[];
  updateCard: (id: number, patch: Partial<Card>) => void;
  addCard: () => void;
  removeCard: (id: number) => void;
  duplicateCard: (id: number) => void;
  moveCard: (index: number, dir: 1 | -1) => void;
  reorderCards: (startIndex: number, endIndex: number) => void;
}

export default function CardsTab({
  cards,
  updateCard,
  addCard,
  removeCard,
  duplicateCard,
  moveCard,
  reorderCards,
}: CardsTabProps) {
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIdx !== null && draggedIdx !== index) {
      setDragOverIdx(index);
    }
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIdx !== null && draggedIdx !== index) {
      reorderCards(draggedIdx, index);
    }
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  return (
    <div className="panel">
      <div className="card-row-header">
        <div></div>
        <div className="field-label" title="Активность карты">Вкл</div>
        <div className="field-label">Порядок</div>
        <div className="field-label">Название карты</div>
        <div className="field-label">Кэшбек, %</div>
        <div className="field-label" title="0 или пусто = без лимита">Лимит, ₽</div>
        <div className="field-label">Округл., ₽</div>
        <div></div>
      </div>

      {cards.map((c, idx) => (
        <CardRow
          key={c.id}
          card={c}
          index={idx}
          onUpdate={updateCard}
          onRemove={removeCard}
          onDuplicate={duplicateCard}
          onMove={moveCard}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
          isDragging={draggedIdx === idx}
          isDragOver={dragOverIdx === idx}
        />
      ))}

      <button className="btn" onClick={addCard}>
        <Plus size={14} /> Добавить карту
      </button>

      <InfoNote>
        Порядок карт можно менять перетаскиванием (за левую иконку) или стрелками. При равенстве тарифов карты с меньшей ёмкостью или расположенные выше в списке заполняются в первую очередь.
      </InfoNote>
    </div>
  );
}
