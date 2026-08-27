// Вкладка «Карты»: таблица карт с редактированием и добавлением новых.
import { Plus } from 'lucide-react';
import CardRow from './CardRow';
import InfoNote from '../InfoNote';
import type { Card } from '../../types';

interface CardsTabProps {
  cards: Card[];
  updateCard: (id: number, patch: Partial<Card>) => void;
  addCard: () => void;
  removeCard: (id: number) => void;
  moveCard: (index: number, dir: 1 | -1) => void;
}

export default function CardsTab({ cards, updateCard, addCard, removeCard, moveCard }: CardsTabProps) {
  return (
    <div className="panel">
      <div className="card-row-header">
        <div className="field-label" title="Активность карты">Вкл</div>
        <div className="field-label">№</div>
        <div className="field-label">Название карты</div>
        <div className="field-label">Кэшбек, %</div>
        <div className="field-label" title="0 или пусто = без лимита">Лимит, ₽</div>
        <div className="field-label">Округл., ₽</div>
        <div></div>
      </div>

      {cards.map((c, idx) => (
        <CardRow key={c.id} card={c} index={idx} onUpdate={updateCard} onRemove={removeCard} onMove={moveCard} />
      ))}

      <button className="btn" onClick={addCard}>
        <Plus size={14} /> Добавить карту
      </button>

      {/* Напоминание про важность порядка карт в списке — см. allocationService.ts */}
      <InfoNote>
        Порядок карт важен: все карты, кроме последней в списке, заполняются до достижения лимита кэшбека.
        Последняя карта получает весь остаток платежей.
      </InfoNote>
    </div>
  );
}
