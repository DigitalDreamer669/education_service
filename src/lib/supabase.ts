import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.error(
    'Отсутствуют переменные окружения VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
      'Скопируйте .env.example в .env и заполните значения.'
  );
}

export const supabase = createClient(url, anonKey);
