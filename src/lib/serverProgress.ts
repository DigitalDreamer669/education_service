import { enqueue } from './syncQueue';
import { getEffectiveUserId } from './authCache';
import {
  refreshSubjectFromServer,
  refreshExamHistoryFromServer,
  readReviewProgress,
  readBookmarks,
  readAllBookmarks,
  readExamHistory,
  readDifficultQuestions,
} from './offlineStore';
import type { ExamAttempt } from '../types';

export type QuestionResult = 'correct' | 'incorrect';
export type { ExamAttempt };

/**
 * Публичный API этого модуля НЕ изменился по сигнатурам — все страницы/хуки
 * (Exam.tsx, Review.tsx, Search.tsx, useProgress.ts, BookmarksPage.tsx) продолжают
 * вызывать те же функции с теми же аргументами и получают тот же тип результата.
 * Изменилась только реализация: раньше каждая функция шла прямо в Supabase, теперь
 * чтение — из IndexedDB (см. lib/offlineStore.ts), запись — через очередь
 * (см. lib/syncQueue.ts). Это и есть "минимальные изменения поверх существующей
 * архитектуры": UI-код вообще не пришлось трогать.
 */

/**
 * Раньше здесь был прямой supabase.auth.getSession(). Проблема: если устройство
 * офлайн дольше времени жизни access token, getSession() вернёт null сессию
 * (обновить токен не с чем достучаться), и все функции ниже начинали молча
 * возвращать "пусто" — прогресс/закладки как будто пропадали, хотя IndexedDB
 * данные никуда не делись. getEffectiveUserId() (см. lib/authCache.ts) сначала
 * тоже пробует живую сессию, но при её отсутствии падает на последнего известного
 * авторизованного пользователя — тот же фолбэк, что использует AuthContext, поэтому
 * они не могут разойтись между собой.
 */
async function currentUserId(): Promise<string | null> {
  return getEffectiveUserId();
}

/** Загрузить прогресс повторения по предмету (из локального кэша, с фоновым обновлением с сервера) */
export async function loadReviewProgress(subject: string): Promise<Record<number, QuestionResult>> {
  const uid = await currentUserId();
  if (!uid) return {};
  // Не блокируем чтение сетью — сначала фоново обновляем, затем всегда читаем из IDB.
  await refreshSubjectFromServer(uid, subject);
  return readReviewProgress(uid, subject);
}

/** Сохранить результат ответа в режиме «Повторение» — ставится в офлайн-очередь */
export async function saveReviewResult(
  subject: string,
  questionId: number,
  result: QuestionResult
): Promise<boolean> {
  const uid = await currentUserId();
  if (!uid) return false;
  await enqueue(uid, { kind: 'review_result', subject, questionId, result });
  return true;
}

/** Сохранить результат экзамена — ставится в офлайн-очередь (started_at служит идемпотентным ключом) */
export async function saveExamAttempt(
  subject: string,
  score: number,
  totalQuestions: number
): Promise<boolean> {
  const uid = await currentUserId();
  if (!uid) return false;
  const startedAt = new Date().toISOString();
  await enqueue(uid, { kind: 'exam_attempt', subject, score, totalQuestions, startedAt });
  return true;
}

/** Загрузить историю экзаменов (из локального кэша, с фоновым обновлением) */
export async function loadExamHistory(): Promise<ExamAttempt[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  await refreshExamHistoryFromServer(uid);
  return readExamHistory(uid);
}

/** Загрузить закладки по предмету */
export async function loadBookmarks(subject: string): Promise<number[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  await refreshSubjectFromServer(uid, subject);
  return readBookmarks(uid, subject);
}

/** Загрузить все закладки пользователя (используется на странице закладок — все предметы сразу) */
export async function loadAllBookmarks(): Promise<{ subject: string; question_id: number }[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  return readAllBookmarks(uid);
}

/**
 * Переключить закладку. Раньше делала read-then-write (select existing, потом insert/delete) —
 * такая пара небезопасна в офлайн-очереди (могла бы продублироваться при повторной отправке).
 * Теперь вычисляем желаемое конечное состояние локально (на основе текущего кэша) и ставим
 * в очередь bookmark_set — идемпотентную операцию (см. syncQueue.ts).
 */
export async function toggleBookmark(subject: string, questionId: number): Promise<boolean> {
  const uid = await currentUserId();
  if (!uid) return false;
  const current = await readBookmarks(uid, subject);
  const willBeBookmarked = !current.includes(questionId);
  await enqueue(uid, { kind: 'bookmark_set', subject, questionId, bookmarked: willBeBookmarked });
  return true;
}

/** Загрузить ID сложных вопросов по предмету (ответы с ошибкой) */
export async function loadDifficultQuestions(subject: string): Promise<number[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  await refreshSubjectFromServer(uid, subject);
  return readDifficultQuestions(uid, subject);
}
