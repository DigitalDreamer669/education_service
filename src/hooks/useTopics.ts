import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { normalizeTopic } from '../lib/parse';
import type { Topic, TopicRow } from '../types';

const cache = new Map<string, Topic[]>();

interface UseTopicsResult {
  topics: Topic[];
  loading: boolean;
  error: string | null;
}

export function useTopics(subject: string | undefined, sourceFile: string | undefined): UseTopicsResult {
  const [topics, setTopics] = useState<Topic[]>(subject ? cache.get(subject) ?? [] : []);
  const [loading, setLoading] = useState(!!subject && !cache.has(subject));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!subject || !sourceFile) return;
    if (cache.has(subject)) {
      setTopics(cache.get(subject)!);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    supabase
      .from('topics_data')
      .select('*')
      .eq('source_file', sourceFile)
      .order('topic_number', { ascending: true })
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError) {
          setError(fetchError.message);
          setLoading(false);
          return;
        }
        const normalized = ((data ?? []) as TopicRow[]).map((row) => normalizeTopic(row, subject));
        cache.set(subject, normalized);
        setTopics(normalized);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [subject, sourceFile]);

  return { topics, loading, error };
}
