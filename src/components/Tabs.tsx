// Верхняя навигация по трём разделам приложения.
import { CreditCard, Layers, Calculator, type LucideIcon } from 'lucide-react';

export type TabId = 'cards' | 'groups' | 'calc';

interface TabsProps {
  tab: TabId;
  setTab: (tab: TabId) => void;
}

const ITEMS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'cards', label: 'Карты', icon: CreditCard },
  { id: 'groups', label: 'Группы', icon: Layers },
  { id: 'calc', label: 'Расчёт', icon: Calculator },
];

export default function Tabs({ tab, setTab }: TabsProps) {
  return (
    <div className="tabs">
      {ITEMS.map(({ id, label, icon: Icon }) => (
        <button key={id} className={`tab ${tab === id ? 'tab-active' : ''}`} onClick={() => setTab(id)}>
          <Icon size={15} /> {label}
        </button>
      ))}
    </div>
  );
}
