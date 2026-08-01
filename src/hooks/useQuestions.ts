import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { normalizeQuestions } from '../lib/parse';
import type { Question, QuestionRow } from '../types';

// Простой in-memory кэш на время жизни вкладки — данные почти не меняются,
// а таблица большая, незачем перезапрашивать при каждом переходе между режимами.
const cache = new Map<string, Question[]>();

interface UseQuestionsResult {
  questions: Question[];
  loading: boolean;
  error: string | null;
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

    supabase
      .from('questions')
      .select('*')
      .eq('subject_name', subject)
      .not('options', 'is', null)
      .order('question_number', { ascending: true })
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError) {
          setError(fetchError.message);
          setLoading(false);
          return;
        }
        const normalized = normalizeQuestions((data ?? []) as QuestionRow[]);
        // Удаляем дубликаты по id (оставляем первое вхождение)
        const seen = new Set<number>();
        const deduped: Question[] = [];
        for (const q of normalized) {
          if (!seen.has(q.id)) {
            seen.add(q.id);
            deduped.push(q);
          }
        }
        cache.set(subject, deduped);
        setQuestions(deduped);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [subject]);

  return { questions, loading, error };
}
