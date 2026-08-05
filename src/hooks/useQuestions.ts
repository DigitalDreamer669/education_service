import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { normalizeQuestions } from '../lib/parse';
import { getDb } from '../lib/db';
import { isOnline } from '../lib/network';
import type { Question, QuestionRow } from '../types';

// In-memory кэш на время жизни вкладки (как и раньше) — IndexedDB под ним теперь
// даёт персистентность между перезапусками/офлайн, а не только между переходами
// внутри одной сессии.
const cache = new Map<string, Question[]>();

interface UseQuestionsResult {
  questions: Question[];
  loading: boolean;
  error: string | null;
}

async function readFromIdb(subject: string): Promise<Question[]> {
  const db = await getDb();
  const rows = (await db.getAllFromIndex('questions', 'by-subject', subject)) as QuestionRow[];
  return normalizeQuestions(rows);
}

async function writeToIdb(rows: QuestionRow[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('questions', 'readwrite');
  for (const row of rows) await tx.store.put(row);
  await tx.done;
}

/** Забирает вопросы предмета с сервера и кладёт их в IndexedDB. Используется и самим
 *  хуком, и prefetchAllSubjects() (см. lib/prefetch.ts) для заблаговременного кэширования
 *  всех предметов сразу после логина — чтобы офлайн работал даже для ещё не открытых
 *  вкладок/предметов, а не только для того, что пользователь успел просмотреть. */
export async function fetchAndCacheQuestions(subject: string): Promise<Question[]> {
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .eq('subject_name', subject)
    .not('options', 'is', null)
    .order('question_number', { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as QuestionRow[];
  await writeToIdb(rows);

  const normalized = normalizeQuestions(rows);
  const seen = new Set<number>();
  const deduped: Question[] = [];
  for (const q of normalized) {
    if (!seen.has(q.id)) {
      seen.add(q.id);
      deduped.push(q);
    }
  }
  cache.set(subject, deduped);
  return deduped;
}

export function useQuestions(subject: string | undefined): UseQuestionsResult {
  const [questions, setQuestions] = useState<Question[]>(subject ? cache.get(subject) ?? [] : []);
  const [loading, setLoading] = useState(!!subject && !cache.has(subject));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!subject) return;
    if (cache.has(subject)) {
      setQuestions(cache.get(subject)!);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      // 1) Сразу показываем то, что уже есть в IndexedDB (может быть пусто при первом
      //    заходе онлайн — тогда просто ждём сетевой запрос ниже).
      try {
        const cached = await readFromIdb(subject);
        if (!cancelled && cached.length > 0) {
          cache.set(subject, cached);
          setQuestions(cached);
          setLoading(false);
        }
      } catch {
        // IndexedDB недоступна (очень редко) — не критично, попробуем сеть
      }

      // 2) Если есть сеть — обновляем в фоне (или как основной источник, если в IDB
      //    ничего не было). Офлайн и нет кэша — остаёмся с пустым списком + ошибкой,
      //    честно сообщая пользователю, что этот предмет ещё не скачан.
      if (!isOnline()) {
        if (!cancelled && !cache.has(subject)) {
          setLoading(false);
          setError('Нет подключения к интернету, а этот предмет ещё не загружен ранее.');
        }
        return;
      }

      try {
        const fresh = await fetchAndCacheQuestions(subject);
        if (!cancelled) {
          setQuestions(fresh);
          setLoading(false);
        }
      } catch (fetchError) {
        if (cancelled) return;
        // Сеть подвела, но в IDB что-то уже было показано выше — не затираем это ошибкой.
        if (!cache.has(subject)) {
          setError(fetchError instanceof Error ? fetchError.message : 'Не удалось загрузить вопросы');
        }
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [subject]);

  return { questions, loading, error };
}
