import { supabase } from './supabase';

export type QuestionResult = 'correct' | 'incorrect';

interface UserProgressRow {
  user_id: string;
  question_id: number;
  result: QuestionResult;
  answered_at: string;
}

export interface ExamAttempt {
  id: number;
  subject: string;
  score: number;
  total_questions: number;
  started_at: string;
  finished_at: string | null;
}

/** Загрузить прогресс повторения по предмету */
export async function loadReviewProgress(subject: string): Promise<Record<number, QuestionResult>> {
  const { data: user } = await supabase.auth.getUser();
  if (!user?.user) return {};

  const { data, error } = await supabase
    .from('user_progress')
    .select('*')
    .eq('user_id', user.user.id)
    .eq('subject', subject);

  if (error) {
    console.error('[serverProgress] loadReviewProgress error:', error.message);
    return {};
  }

  const results: Record<number, QuestionResult> = {};
  for (const row of data ?? []) {
    results[row.question_id] = row.result;
  }
  return results;
}

/** Сохранить результат ответа в режиме «Повторение» */
export async function saveReviewResult(
  subject: string,
  questionId: number,
  result: QuestionResult
): Promise<boolean> {
  const { data: user } = await supabase.auth.getUser();
  if (!user?.user) return false;

  // Upsert: если запись уже есть — обновляем результат
  const { error } = await supabase
    .from('user_progress')
    .upsert(
      { user_id: user.user.id, subject, question_id: questionId, result },
      { on_conflict: 'user_id,subject,question_id' }
    );

  if (error) {
    console.error('[serverProgress] saveReviewResult error:', error.message);
    return false;
  }
  return true;
}

/** Сохранить результат экзамена */
export async function saveExamAttempt(
  subject: string,
  score: number,
  totalQuestions: number
): Promise<boolean> {
  const { data: user } = await supabase.auth.getUser();
  if (!user?.user) return false;

  const now = new Date().toISOString();
  const { error } = await supabase.from('exam_attempts').insert({
    user_id: user.user.id,
    subject,
    score,
    total_questions: totalQuestions,
    started_at: now,
    finished_at: now,
  });

  if (error) {
    console.error('[serverProgress] saveExamAttempt error:', error.message);
    return false;
  }
  return true;
}

/** Загрузить историю экзаменов */
export async function loadExamHistory(): Promise<ExamAttempt[]> {
  const { data: user } = await supabase.auth.getUser();
  if (!user?.user) return [];

  const { data, error } = await supabase
    .from('exam_attempts')
    .select('*')
    .eq('user_id', user.user.id)
    .order('started_at', { ascending: false });

  if (error) {
    console.error('[serverProgress] loadExamHistory error:', error.message);
    return [];
  }

  return (data ?? []) as ExamAttempt[];
}
