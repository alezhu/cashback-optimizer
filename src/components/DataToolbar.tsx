// Панель экспорта/импорта данных: выгрузить текущее состояние в .json-файл
// или загрузить ранее выгруженный файл обратно. Импорт полностью заменяет
// текущие карты, группы и допустимое превышение.
import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { exportStateToFile, parseImportedState } from '../services/exportImport';
import type { PersistedState } from '../types';

interface DataToolbarProps {
  getState: () => PersistedState;
  onImport: (state: PersistedState) => void;
}

export default function DataToolbar({ getState, onImport }: DataToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = () => {
    exportStateToFile(getState());
  };

  const handleImportClick = () => {
    setError(null);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Сбрасываем value сразу, чтобы повторный выбор того же файла тоже сработал.
    e.target.value = '';
    if (!file) return;

    file
      .text()
      .then((text) => {
        const state = parseImportedState(text);
        onImport(state);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Не удалось прочитать файл');
      });
  };

  return (
    <div className="data-toolbar">
      <button className="btn" onClick={handleExport} title="Скачать карты, группы и настройки в JSON-файл">
        <Download size={14} /> Экспорт JSON
      </button>
      <button className="btn" onClick={handleImportClick} title="Загрузить карты и группы из ранее сохранённого JSON-файла">
        <Upload size={14} /> Импорт JSON
      </button>
      <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={handleFileChange} />
      {error && <span className="data-toolbar-error">{error}</span>}
    </div>
  );
}
