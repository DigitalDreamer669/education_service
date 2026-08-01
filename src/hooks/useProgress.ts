import { useCallback, useEffect, useState } from 'react';
import { loadReviewProgress, saveReviewResult as saveServerReviewResult, saveExamAttempt as saveServerExamAttempt, loadExamHistory, type QuestionResult, type ExamAttempt } from '../lib/serverProgress';

interface UseReviewProgressReturn {
  loading: boolean;
  error: string | null;
  results: Record<number, QuestionResult>;
  saveResult: (questionId: number, result: QuestionResult) => Promise<void>;
}

interface UseExamHistoryReturn {
  loading: boolean;
  error: string | null;
  attempts: ExamAttempt[];
  saveAttempt: (subject: string, score: number, total: number) => Promise<boolean>;
}

/** Хук для прогресса режима «Повторение» */
export function useReviewProgress(subject: string | undefined): UseReviewProgressReturn {
  const [results, setResults] = useState<Record<number, QuestionResult>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!subject) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    loadReviewProgress(subject).then((data) => {
      if (cancelled) return;
      setResults(data);
      setLoading(false);
    }).catch((err) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : 'Не удалось загрузить прогресс');
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [subject]);

  const saveResult = useCallback(async (questionId: number, result: QuestionResult) => {
    if (!subject) return;
    setResults((prev) => ({ ...prev, [questionId]: result }));
    await saveServerReviewResult(subject, questionId, result);
  }, [subject]);

  return { loading, error, results, saveResult };
}

/** Хук для истории экзаменов */
export function useExamHistory(): UseExamHistoryReturn {
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    loadExamHistory().then((data) => {
      if (cancelled) return;
      setAttempts(data);
      setLoading(false);
    }).catch((err) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : 'Не удалось загрузить историю');
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, []);

  const saveAttempt = useCallback(async (subject: string, score: number, total: number): Promise<boolean> => {
    const ok = await saveServerExamAttempt(subject, score, total);
    if (ok) {
      // Перезагрузить историю после сохранения
      const fresh = await loadExamHistory();
      setAttempts(fresh);
    }
    return ok;
  }, []);

  return { loading, error, attempts, saveAttempt };
}
