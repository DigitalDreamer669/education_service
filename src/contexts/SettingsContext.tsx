import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';

/**
 * Пользовательские настройки отображения — хранятся в localStorage (кеш браузера),
 * поэтому применяются одинаково на всех страницах: Повторение, Экзамен, Закладки.
 */
export interface AppSettings {
  /** Показывать блок «Пояснение» к вопросу. По умолчанию выключено — пояснение скрыто. */
  showExplanations: boolean;
  /** Показывать статистику «Как отвечали другие» в панели помощи. */
  showAnswerStats: boolean;
  /** Перемешивать порядок вариантов ответа при каждом показе вопроса. */
  shuffleOptions: boolean;
}

const STORAGE_KEY = 'edu_app_settings_v1';

const DEFAULT_SETTINGS: AppSettings = {
  showExplanations: false,
  showAnswerStats: true,
  shuffleOptions: false,
};

function readSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

interface SettingsContextValue {
  settings: AppSettings;
  setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  resetSettings: () => void;
}

export const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  setSetting: () => {},
  resetSettings: () => {},
});

export function SettingsContextProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => readSettings());

  // Сохраняем в localStorage при любом изменении
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // localStorage может быть недоступен (приватный режим и т.п.) — молча игнорируем
    }
  }, [settings]);

  // Синхронизация между вкладками
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) {
        setSettings(readSettings());
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setSetting = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, setSetting, resetSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}
