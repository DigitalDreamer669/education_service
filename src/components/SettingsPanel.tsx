import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../hooks/useSettings';
import type { AppSettings } from '../contexts/SettingsContext';
import './SettingsPanel.css';

interface ToggleRow {
  key: keyof AppSettings;
  label: string;
  hint: string;
}

const ROWS: ToggleRow[] = [
  {
    key: 'showExplanations',
    label: 'Показывать пояснения к вопросам',
    hint: 'Открывает доступ к блоку «Пояснение» в панели помощи. По умолчанию выключено.',
  },
  {
    key: 'showAnswerStats',
    label: 'Показывать статистику ответов',
    hint: 'Блок «Как отвечали другие» в панели помощи.',
  },
  {
    key: 'shuffleOptions',
    label: 'Перемешивать варианты ответа',
    hint: 'Порядок вариантов будет случайным при каждом показе вопроса.',
  },
];

export function SettingsPanel() {
  const { settings, setSetting, resetSettings } = useSettings();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) {
      document.addEventListener('mousedown', onClickOutside);
      document.addEventListener('keydown', onEsc);
    }
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div className="settings-panel" ref={rootRef}>
      <button
        type="button"
        className="settings-panel__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.42.63.76 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        Доп. параметры
      </button>

      {open && (
        <div className="settings-panel__dropdown">
          <div className="settings-panel__head">
            <span>Доп. параметры</span>
            <span className="settings-panel__badge">хранится в браузере</span>
          </div>

          <div className="settings-panel__list">
            {ROWS.map((row) => (
              <label key={row.key} className="settings-panel__row">
                <input
                  type="checkbox"
                  checked={settings[row.key]}
                  onChange={(e) => setSetting(row.key, e.target.checked)}
                />
                <span className="settings-panel__switch" aria-hidden="true" />
                <span className="settings-panel__text">
                  <span className="settings-panel__label">{row.label}</span>
                  <span className="settings-panel__hint">{row.hint}</span>
                </span>
              </label>
            ))}
          </div>

          <button type="button" className="settings-panel__reset" onClick={resetSettings}>
            Сбросить настройки
          </button>
        </div>
      )}
    </div>
  );
}
