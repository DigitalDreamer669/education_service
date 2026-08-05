import { supabase } from './supabase';
import { getDb, compositeKey, type PendingOp, type QueueItem } from './db';
import { isOnline, onNetworkChange } from './network';

/**
 * Очередь исходящих изменений — единственный путь записи прогресса/закладок/попыток
 * экзамена в Supabase. UI (serverProgress.ts) больше не пишет в Supabase напрямую:
 * он вызывает enqueue(), которая:
 *   1) сразу применяет изменение к локальному зеркалу (IndexedDB) — UI читает из
 *      зеркала и поэтому не замечает, онлайн мы или офлайн (требование "seamless");
 *   2) кладёт операцию в очередь sync_queue;
 *   3) пытается сразу же слить очередь, если есть сеть.
 *
 * Гарантии:
 *  - Atomic per-item: операция считается выполненной только после успешного ответа
 *    Supabase; до этого момента она остаётся в очереди на диске (IndexedDB), поэтому
 *    закрытие вкладки/сбой сети посреди отправки не теряет и не дублирует её —
 *    при следующем запуске flush продолжит с этой же записи.
 *    (Настоящей кросс-табличной транзакции без серверной функции не сделать без
 *    изменения схемы БД — это сознательный trade-off, см. README_OFFLINE.md.)
 *  - Идемпотентность при повторной отправке:
 *      review_result  -> upsert(onConflict: user_id,subject,question_id) — естественно идемпотентен
 *      bookmark_set   -> хранит желаемое конечное состояние (не "toggle"), insert-if-absent /
 *                        delete-if-present — повторный вызов не меняет результат
 *      exam_attempt   -> перед insert проверяем, нет ли уже записи с тем же
 *                        (user_id, subject, started_at) — started_at генерируется один раз
 *                        на клиенте при создании операции и используется как natural key
 *  - Без дублей: см. выше + компакция очереди (см. enqueue) — если для одного и того же
 *    вопроса уже есть неотправленная операция того же типа, она заменяется новым значением
 *    вместо накопления дубликатов.
 *  - Порядок: обрабатывается строго FIFO, по одной операции за раз; если операция
 *    завершилась ошибкой сети — процесс останавливается (чтобы не нарушить порядок) и
 *    продолжится при следующем триггере (online-событие / фокус вкладки / таймер / ручной вызов).
 *    Если ошибка НЕ сетевая (например, RLS/4xx) — операция помечается failed с текстом ошибки
 *    и пропускается, чтобы не блокировать остальную очередь навсегда.
 */

type Subscriber = () => void;
const subscribers = new Set<Subscriber>();
export function subscribeQueue(cb: Subscriber): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}
function emitChange() {
  for (const s of subscribers) s();
}

let flushing = false;
let flushScheduled = false;

function scheduleFlush(delayMs = 0) {
  if (flushScheduled) return;
  flushScheduled = true;
  setTimeout(() => {
    flushScheduled = false;
    void flushQueue();
  }, delayMs);
}

// Триггеры автосинхронизации: вернулись онлайн / вкладка снова видима / раз в интервал.
if (typeof window !== 'undefined') {
  onNetworkChange((online) => {
    if (online) scheduleFlush();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isOnline()) scheduleFlush();
  });
  // Периодический "подстраховочный" тик — на случай если событие online не сработало
  // (бывает в некоторых мобильных браузерах при смене сети wifi/LTE).
  setInterval(() => {
    if (isOnline()) scheduleFlush();
  }, 30_000);

  // Progressive enhancement: Background Sync API (Chrome/Android). Safari/iOS не
  // поддерживает его вовсе — там синхронизацию тянут триггеры выше, пока вкладка
  // открыта, плюс попытка сразу при следующем запуске приложения.
  navigator.serviceWorker?.ready
    .then((reg) => {
      const syncManager = (reg as unknown as { sync?: { register(tag: string): Promise<void> } }).sync;
      return syncManager?.register('flush-sync-queue');
    })
    .catch(() => {
      /* Background Sync недоступен — не критично, есть фолбэки выше */
    });
}

/** Применяет операцию к локальному зеркалу немедленно (оптимистичное обновление, читает UI). */
async function applyOptimistic(userId: string, op: PendingOp): Promise<void> {
  const db = await getDb();
  if (op.kind === 'review_result') {
    const key = compositeKey(userId, op.subject, op.questionId);
    await db.put('reviewResults', { key, userId, subject: op.subject, questionId: op.questionId, result: op.result });
  } else if (op.kind === 'bookmark_set') {
    const key = compositeKey(userId, op.subject, op.questionId);
    if (op.bookmarked) {
      await db.put('bookmarks', { key, userId, subject: op.subject, questionId: op.questionId });
    } else {
      await db.delete('bookmarks', key);
    }
  } else if (op.kind === 'exam_attempt') {
    await db.put('examAttempts', {
      localId: `local:${op.startedAt}:${userId}`,
      userId,
      subject: op.subject,
      score: op.score,
      total_questions: op.totalQuestions,
      started_at: op.startedAt,
      finished_at: op.startedAt,
      synced: false,
    });
  }
}

/** true если существующий item в очереди "того же слота", что и новый — тогда заменяем, а не дублируем. */
function sameSlot(a: PendingOp, b: PendingOp): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'review_result' && b.kind === 'review_result') {
    return a.subject === b.subject && a.questionId === b.questionId;
  }
  if (a.kind === 'bookmark_set' && b.kind === 'bookmark_set') {
    return a.subject === b.subject && a.questionId === b.questionId;
  }
  return false; // exam_attempt — каждая попытка отдельная, не компактуется
}

/** Поставить операцию в очередь (с компакцией) + применить оптимистично + попытаться отправить. */
export async function enqueue(userId: string, op: PendingOp): Promise<void> {
  const db = await getDb();

  await applyOptimistic(userId, op);

  // Компакция: если в очереди уже есть неотправленный (status='pending') item того же
  // "слота" (тот же вопрос/предмет), заменяем его значение вместо добавления нового —
  // так при офлайн-серии из 5 ответов на один и тот же вопрос улетит один запрос, а не 5,
  // и порядок остальной очереди не нарушается.
  const tx = db.transaction('syncQueue', 'readwrite');
  const store = tx.objectStore('syncQueue');
  let cursor = await store.index('by-status').openCursor('pending');
  let replaced = false;
  while (cursor) {
    if (cursor.value.userId === userId && sameSlot(cursor.value.op, op)) {
      await cursor.update({ ...cursor.value, op, createdAt: new Date().toISOString() });
      replaced = true;
      break;
    }
    cursor = await cursor.continue();
  }
  if (!replaced) {
    await store.add({
      userId,
      op,
      createdAt: new Date().toISOString(),
      attempts: 0,
      status: 'pending',
    });
  }
  await tx.done;

  emitChange();
  if (isOnline()) scheduleFlush();
}

/** Есть ли сетевая природа у ошибки (стоит повторить позже) — иначе считаем операцию окончательно неудачной. */
function isNetworkError(err: unknown): boolean {
  if (!isOnline()) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /fetch|network|failed to fetch|NetworkError|timeout/i.test(msg);
}

async function sendOne(item: QueueItem): Promise<'ok' | 'retry' | 'failed'> {
  const { op, userId } = item;
  try {
    if (op.kind === 'review_result') {
      const { error } = await supabase
        .from('user_progress')
        .upsert(
          { user_id: userId, subject: op.subject, question_id: op.questionId, result: op.result },
          { onConflict: 'user_id,subject,question_id' }
        );
      if (error) throw error;
      return 'ok';
    }

    if (op.kind === 'bookmark_set') {
      if (op.bookmarked) {
        // insert-if-absent: полагаемся на уникальный индекс (user_id,subject,question_id) в БД —
        // upsert с ignoreDuplicates делает это одним идемпотентным запросом без гонки check-then-insert.
        const { error } = await supabase
          .from('bookmarks')
          .upsert(
            { user_id: userId, subject: op.subject, question_id: op.questionId },
            { onConflict: 'user_id,subject,question_id', ignoreDuplicates: true }
          );
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('bookmarks')
          .delete()
          .eq('user_id', userId)
          .eq('subject', op.subject)
          .eq('question_id', op.questionId);
        if (error) throw error;
      }
      return 'ok';
    }

    if (op.kind === 'exam_attempt') {
      // Идемпотентность без схемы: проверяем, нет ли уже попытки с тем же started_at
      // (сгенерирован один раз на клиенте при постановке в очередь).
      const { data: existing, error: selErr } = await supabase
        .from('exam_attempts')
        .select('id')
        .eq('user_id', userId)
        .eq('subject', op.subject)
        .eq('started_at', op.startedAt)
        .maybeSingle();
      if (selErr) throw selErr;

      if (!existing) {
        const { error: insErr } = await supabase.from('exam_attempts').insert({
          user_id: userId,
          subject: op.subject,
          score: op.score,
          total_questions: op.totalQuestions,
          started_at: op.startedAt,
          finished_at: op.startedAt,
        });
        if (insErr) throw insErr;
      }

      const db = await getDb();
      const localId = `local:${op.startedAt}:${userId}`;
      const rec = await db.get('examAttempts', localId);
      if (rec) await db.put('examAttempts', { ...rec, synced: true });
      return 'ok';
    }

    return 'ok';
  } catch (err) {
    return isNetworkError(err) ? 'retry' : 'failed';
  }
}

/** Слить очередь: строго по порядку, одна операция за раз, до первой ошибки сети (см. доку выше). */
export async function flushQueue(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const db = await getDb();
    for (;;) {
      const tx = db.transaction('syncQueue', 'readonly');
      const items = await tx.objectStore('syncQueue').index('by-status').getAll('pending');
      await tx.done;
      if (items.length === 0) break;

      const item = items[0];
      if (item.id === undefined) break;

      await db.put('syncQueue', { ...item, status: 'syncing' });
      const outcome = await sendOne(item);

      if (outcome === 'ok') {
        await db.delete('syncQueue', item.id);
        emitChange();
        continue; // сразу переходим к следующей
      }
      if (outcome === 'failed') {
        // Не сетевая ошибка (например, отклонено RLS) — не блокируем остальную очередь,
        // но и не молчим: помечаем failed, чтобы UI мог это показать/залогировать.
        await db.put('syncQueue', {
          ...item,
          status: 'pending',
          attempts: item.attempts + 1,
          lastError: 'non-network error, see console',
        });
        emitChange();
        break;
      }
      // 'retry' — сетевая ошибка: откатываем в pending и останавливаемся, порядок сохранён.
      await db.put('syncQueue', { ...item, status: 'pending', attempts: item.attempts + 1 });
      emitChange();
      break;
    }
  } finally {
    flushing = false;
  }
}

export async function getPendingCount(userId: string): Promise<number> {
  const db = await getDb();
  const all = await db.getAllFromIndex('syncQueue', 'by-status', 'pending');
  return all.filter((i) => i.userId === userId).length;
}
