import { supabase } from './supabase';

export type QuestionResult = 'correct' | 'incorrect';

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
      { onConflict: 'user_id,subject,question_id' }
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

/** Загрузить закладки по предмету */
export async function loadBookmarks(subject: string): Promise<number[]> {
  const { data: user } = await supabase.auth.getUser();
  if (!user?.user) return [];

  const { data, error } = await supabase
    .from('bookmarks')
    .select('question_id')
    .eq('user_id', user.user.id)
    .eq('subject', subject);

  if (error) {
    console.error('[serverProgress] loadBookmarks error:', error.message);
    return [];
  }

  return (data ?? []).map((row: { question_id: number }) => row.question_id);
}

/** Загрузить все закладки пользователя */
export async function loadAllBookmarks(): Promise<{ subject: string; question_id: number }[]> {
  const { data: user } = await supabase.auth.getUser();
  if (!user?.user) return [];

  const { data, error } = await supabase
    .from('bookmarks')
    .select('subject, question_id')
    .eq('user_id', user.user.id);

  if (error) {
    console.error('[serverProgress] loadAllBookmarks error:', error.message);
    return [];
  }

  return data ?? [];
}

/** Переключить закладку: если есть — удалить, иначе вставить */
export async function toggleBookmark(
  subject: string,
  questionId: number
): Promise<boolean> {
  const { data: user } = await supabase.auth.getUser();
  if (!user?.user) return false;

  // Сначала проверяем, есть ли уже закладка
  const { data: existing } = await supabase
    .from('bookmarks')
    .select('id')
    .eq('user_id', user.user.id)
    .eq('subject', subject)
    .eq('question_id', questionId)
    .single();

  if (existing) {
    // Удаляем
    const { error } = await supabase
      .from('bookmarks')
      .delete()
      .eq('id', existing.id);
    if (error) {
      console.error('[serverProgress] toggleBookmark delete error:', error.message);
      return false;
    }
  } else {
    // Создаём
    const { error } = await supabase.from('bookmarks').insert({
      user_id: user.user.id,
      subject,
      question_id: questionId,
    });
    if (error) {
      console.error('[serverProgress] toggleBookmark insert error:', error.message);
      return false;
    }
  }

  return true;
}

/** Загрузить ID сложных вопросов по предмету (ответы с ошибкой) */
export async function loadDifficultQuestions(subject: string): Promise<number[]> {
  const { data: user } = await supabase.auth.getUser();
  if (!user?.user) return [];

  const { data, error } = await supabase
    .from('user_progress')
    .select('question_id')
    .eq('user_id', user.user.id)
    .eq('subject', subject)
    .eq('result', 'incorrect');

  if (error) {
    console.error('[serverProgress] loadDifficultQuestions error:', error.message);
    return [];
  }

  // Уникальные question_id
  const ids = new Set((data ?? []).map((row: { question_id: number }) => row.question_id));
  return [...ids];
}
