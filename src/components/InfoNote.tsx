// Небольшая плашка-подсказка с иконкой — используется для пояснений в интерфейсе.
import { Info } from 'lucide-react';
import type { ReactNode } from 'react';

interface InfoNoteProps {
  children: ReactNode;
}

export default function InfoNote({ children }: InfoNoteProps) {
  return (
    <div className="info-note">
      <Info size={14} />
      <span>{children}</span>
    </div>
  );
}
