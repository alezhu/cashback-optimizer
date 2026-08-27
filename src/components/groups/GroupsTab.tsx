// Вкладка «Группы»: список групп платежей + добавление, дублирование и Drag-and-Drop.
import { useState } from 'react';
import { Plus } from 'lucide-react';
import GroupPanel from './GroupPanel';
import type { Group, Payment } from '../../types';

interface GroupsTabProps {
  groups: Group[];
  openGroups: Set<number>;
  toggleGroup: (id: number) => void;
  addGroup: () => void;
  removeGroup: (id: number) => void;
  duplicateGroup: (id: number) => void;
  updateGroup: (id: number, patch: Partial<Group>) => void;
  reorderGroups: (startIndex: number, endIndex: number) => void;
  addPayment: (groupId: number) => void;
  updatePayment: (groupId: number, paymentId: number, patch: Partial<Payment>) => void;
  removePayment: (groupId: number, paymentId: number) => void;
}

export default function GroupsTab({
  groups,
  openGroups,
  toggleGroup,
  addGroup,
  removeGroup,
  duplicateGroup,
  updateGroup,
  reorderGroups,
  addPayment,
  updatePayment,
  removePayment,
}: GroupsTabProps) {
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
      reorderGroups(draggedIdx, index);
    }
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  return (
    <div>
      {groups.map((g, idx) => (
        <GroupPanel
          key={g.id}
          group={g}
          index={idx}
          open={openGroups.has(g.id)}
          onToggle={toggleGroup}
          updateGroup={updateGroup}
          removeGroup={removeGroup}
          duplicateGroup={duplicateGroup}
          addPayment={addPayment}
          updatePayment={updatePayment}
          removePayment={removePayment}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
          isDragging={draggedIdx === idx}
          isDragOver={dragOverIdx === idx}
        />
      ))}

      <button className="btn" onClick={addGroup}>
        <Plus size={14} /> Добавить группу
      </button>
    </div>
  );
}
