// Вкладка «Группы»: список групп платежей + кнопка добавления новой группы.
import { Plus } from 'lucide-react';
import GroupPanel from './GroupPanel';
import type { Group, Payment } from '../../types';

interface GroupsTabProps {
  groups: Group[];
  openGroups: Set<number>;
  toggleGroup: (id: number) => void;
  addGroup: () => void;
  removeGroup: (id: number) => void;
  updateGroup: (id: number, patch: Partial<Group>) => void;
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
  updateGroup,
  addPayment,
  updatePayment,
  removePayment,
}: GroupsTabProps) {
  return (
    <div>
      {groups.map((g) => (
        <GroupPanel
          key={g.id}
          group={g}
          open={openGroups.has(g.id)}
          onToggle={toggleGroup}
          updateGroup={updateGroup}
          removeGroup={removeGroup}
          addPayment={addPayment}
          updatePayment={updatePayment}
          removePayment={removePayment}
        />
      ))}

      <button className="btn" onClick={addGroup}>
        <Plus size={14} /> Добавить группу
      </button>
    </div>
  );
}
