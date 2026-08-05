import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { normalizeTopic } from '../lib/parse';
import { getDb } from '../lib/db';
import { isOnline } from '../lib/network';
import type { Topic, TopicRow } from '../types';

const cache = new Map<string, Topic[]>();

interface UseTopicsResult {
  topics: Topic[];
  loading: boolean;
  error: string | null;
}

async function readFromIdb(sourceFile: string, subject: string): Promise<Topic[]> {
  const db = await getDb();
  const rows = (await db.getAllFromIndex('topics', 'by-source-file', sourceFile)) as TopicRow[];
  return rows
    .map((row) => normalizeTopic(row, subject))
    .sort((a, b) => a.number - b.number);
}

async function writeToIdb(rows: TopicRow[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('topics', 'readwrite');
  for (const row of rows) await tx.store.put(row);
  await tx.done;
}

/** Забирает конспекты предмета с сервера и кладёт их в IndexedDB (используется хуком
 *  и prefetchAllSubjects()). */
export async function fetchAndCacheTopics(subject: string, sourceFile: string): Promise<Topic[]> {
  const { data, error } = await supabase
    .from('topics_data')
    .select('*')
    .eq('source_file', sourceFile)
    .order('topic_number', { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as TopicRow[];
  await writeToIdb(rows);

  const normalized = rows.map((row) => normalizeTopic(row, subject));
  cache.set(subject, normalized);
  return normalized;
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

    (async () => {
      try {
        const cached = await readFromIdb(sourceFile, subject);
        if (!cancelled && cached.length > 0) {
          cache.set(subject, cached);
          setTopics(cached);
          setLoading(false);
        }
      } catch {
        // ignore, попробуем сеть
      }

      if (!isOnline()) {
        if (!cancelled && !cache.has(subject)) {
          setLoading(false);
          setError('Нет подключения к интернету, а конспекты этого предмета ещё не загружены ранее.');
        }
        return;
      }

      try {
        const fresh = await fetchAndCacheTopics(subject, sourceFile);
        if (!cancelled) {
          setTopics(fresh);
          setLoading(false);
        }
      } catch (fetchError) {
        if (cancelled) return;
        if (!cache.has(subject)) {
          setError(fetchError instanceof Error ? fetchError.message : 'Не удалось загрузить конспекты');
        }
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [subject, sourceFile]);

  return { topics, loading, error };
}
