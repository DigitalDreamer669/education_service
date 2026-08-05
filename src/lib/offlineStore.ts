import { supabase } from './supabase';
import { getDb, compositeKey } from './db';
import { isOnline } from './network';

/**
 * "Источник правды" для чтения — всегда IndexedDB, а не сеть напрямую (см. serverProgress.ts).
 * Эти функции подтягивают свежие данные с сервера И записывают их в IDB, но НИКОГДА не
 * перезаписывают запись, для которой в sync_queue есть неотправленная операция — иначе
 * офлайн-изменение пользователя молча затрётся более старым сервер-состоянием при
 * следующем фоновом обновлении.
 */

async function pendingSlots(userId: string): Promise<Set<string>> {
  const db = await getDb();
  const pending = await db.getAllFromIndex('syncQueue', 'by-status', 'pending');
  const slots = new Set<string>();
  for (const item of pending) {
    if (item.userId !== userId) continue;
    const op = item.op;
    if (op.kind === 'review_result' || op.kind === 'bookmark_set') {
      slots.add(`${op.kind}:${op.subject}:${op.questionId}`);
    }
  }
  return slots;
}

/** Фоновая синхронизация "с сервера в IDB" для одного предмета. Не бросает — вызывающий код
 *  не должен ждать её, чтение всегда идёт из IDB (см. loadReviewProgress и т.д.). */
export async function refreshSubjectFromServer(userId: string, subject: string): Promise<void> {
  if (!isOnline()) return;
  const db = await getDb();
  const skip = await pendingSlots(userId);

  try {
    const [{ data: progressRows }, { data: bookmarkRows }] = await Promise.all([
      supabase.from('user_progress').select('*').eq('user_id', userId).eq('subject', subject),
      supabase.from('bookmarks').select('*').eq('user_id', userId).eq('subject', subject),
    ]);

    const tx = db.transaction(['reviewResults', 'bookmarks'], 'readwrite');
    for (const row of progressRows ?? []) {
      const key = compositeKey(userId, subject, row.question_id);
      if (skip.has(`review_result:${subject}:${row.question_id}`)) continue;
      await tx.objectStore('reviewResults').put({
        key,
        userId,
        subject,
        questionId: row.question_id,
        result: row.result,
      });
    }
    for (const row of bookmarkRows ?? []) {
      const key = compositeKey(userId, subject, row.question_id);
      if (skip.has(`bookmark_set:${subject}:${row.question_id}`)) continue;
      await tx.objectStore('bookmarks').put({ key, userId, subject, questionId: row.question_id });
    }
    await tx.done;
  } catch {
    // офлайн/сбой сети — молча пропускаем, в IDB остаётся то, что было
  }
}

export async function refreshExamHistoryFromServer(userId: string): Promise<void> {
  if (!isOnline()) return;
  try {
    const { data } = await supabase
      .from('exam_attempts')
      .select('*')
      .eq('user_id', userId)
      .order('started_at', { ascending: false });
    const db = await getDb();
    const tx = db.transaction('examAttempts', 'readwrite');
    for (const row of data ?? []) {
      await tx.store.put({
        localId: `server:${row.id}`,
        userId,
        subject: row.subject,
        score: row.score,
        total_questions: row.total_questions,
        started_at: row.started_at,
        finished_at: row.finished_at,
        synced: true,
      });
    }
    await tx.done;
  } catch {
    // офлайн — игнорируем, читаем то, что уже закэшировано
  }
}

export async function readReviewProgress(
  userId: string,
  subject: string
): Promise<Record<number, 'correct' | 'incorrect'>> {
  const db = await getDb();
  const rows = await db.getAllFromIndex('reviewResults', 'by-user-subject', [userId, subject]);
  const out: Record<number, 'correct' | 'incorrect'> = {};
  for (const r of rows) out[r.questionId] = r.result;
  return out;
}

export async function readBookmarks(userId: string, subject: string): Promise<number[]> {
  const db = await getDb();
  const rows = await db.getAllFromIndex('bookmarks', 'by-user-subject', [userId, subject]);
  return rows.map((r) => r.questionId);
}

export async function readAllBookmarks(userId: string): Promise<{ subject: string; question_id: number }[]> {
  const db = await getDb();
  const rows = await db.getAllFromIndex('bookmarks', 'by-user', userId);
  return rows.map((r) => ({ subject: r.subject, question_id: r.questionId }));
}

export async function readExamHistory(userId: string) {
  const db = await getDb();
  const rows = await db.getAllFromIndex('examAttempts', 'by-user', userId);
  return rows
    .sort((a, b) => (a.started_at < b.started_at ? 1 : -1))
    .map((r) => ({
      id: r.localId,
      subject: r.subject,
      score: r.score,
      total_questions: r.total_questions,
      started_at: r.started_at,
      finished_at: r.finished_at,
    }));
}

export async function readDifficultQuestions(userId: string, subject: string): Promise<number[]> {
  const db = await getDb();
  const rows = await db.getAllFromIndex('reviewResults', 'by-user-subject', [userId, subject]);
  return [...new Set(rows.filter((r) => r.result === 'incorrect').map((r) => r.questionId))];
}
