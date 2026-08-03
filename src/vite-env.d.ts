/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Ключ OpenRouter для ИИ-поиска (см. src/lib/aiSearch.ts). Опционален — без него кнопка "Спросить ИИ" покажет ошибку конфигурации, остальной сайт работает как раньше. */
  readonly VITE_OPENROUTER_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
