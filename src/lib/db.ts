import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { QuestionRow, TopicRow } from '../types';

/**
 * Единое офлайн-хранилище приложения (IndexedDB).
 *
 * Дизайн-принцип: это НЕ копия схемы Supabase, а плоский набор object store'ов,
 * оптимизированных под то, как данные реально читаются в UI (по subject),
 * плюс одна отдельная очередь исходящих изменений (sync_queue) для всего,
 * что раньше писалось напрямую в Supabase из serverProgress.ts.
 *
 * Версionирование: если структуру когда-нибудь потребуется поменять — просто
 * поднять DB_VERSION и добавить `if (oldVersion < N)` блок в upgrade(), не трогая
 * предыдущие блоки (стандартная практика для IndexedDB миграций на клиенте).
 */

const DB_NAME = 'itmo-prep-offline';
const DB_VERSION = 1;

// ---- Полезная нагрузка отложенных операций (то, что раньше уходило прямо в Supabase) ----

export type PendingOp =
  | {
      kind: 'review_result';
      /** Желаемое конечное состояние — upsert идемпотентен сам по себе (onConflict user_id,subject,question_id) */
      subject: string;
      questionId: number;
      result: 'correct' | 'incorrect';
    }
  | {
      kind: 'bookmark_set';
      /** Не "toggle", а желаемое конечное состояние — так операция идемпотентна при повторной отправке */
      subject: string;
      questionId: number;
      bookmarked: boolean;
    }
  | {
      kind: 'exam_attempt';
      subject: string;
      score: number;
      totalQuestions: number;
      /** Генерируется на клиенте один раз при создании операции — служит натуральным ключом
       *  идемпотентности для insert-only таблицы exam_attempts (в которой нет client_id колонки
       *  и которую нельзя добавить без миграции): перед вставкой проверяем, нет ли уже записи
       *  с этим user_id+subject+startedAt). */
      startedAt: string;
    };

export interface QueueItem {
  /** Ключ очереди — уникален и монотонно возрастает (используем autoIncrement) */
  id?: number;
  userId: string;
  op: PendingOp;
  createdAt: string;
  attempts: number;
  lastError?: string;
  status: 'pending' | 'syncing';
}

interface OfflineDBSchema extends DBSchema {
  questions: {
    key: number; // question id
    value: QuestionRow;
    indexes: { 'by-subject': string };
  };
  topics: {
    key: number; // topic id
    value: TopicRow;
    indexes: { 'by-source-file': string };
  };
  // Локальное зеркало server-состояния (то, что уже подтверждено сервером) —
  // используется для чтения offline и как база, поверх которой накатывается sync_queue.
  reviewResults: {
    key: string; // `${userId}:${subject}:${questionId}`
    value: {
      key: string;
      userId: string;
      subject: string;
      questionId: number;
      result: 'correct' | 'incorrect';
    };
    indexes: { 'by-user-subject': [string, string] };
  };
  bookmarks: {
    key: string; // `${userId}:${subject}:${questionId}`
    value: { key: string; userId: string; subject: string; questionId: number };
    indexes: { 'by-user-subject': [string, string]; 'by-user': string };
  };
  examAttempts: {
    key: string; // локальный id (client-side, если ещё не подтверждён) либо `server:${id}`
    value: {
      localId: string;
      userId: string;
      subject: string;
      score: number;
      total_questions: number;
      started_at: string;
      finished_at: string | null;
      synced: boolean;
    };
    indexes: { 'by-user': string };
  };
  syncQueue: {
    key: number;
    value: QueueItem;
    indexes: { 'by-status': string };
  };
  meta: {
    key: string;
    value: unknown;
  };
}

let dbPromise: Promise<IDBPDatabase<OfflineDBSchema>> | null = null;

export function getDb(): Promise<IDBPDatabase<OfflineDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<OfflineDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('questions')) {
          const s = db.createObjectStore('questions', { keyPath: 'id' });
          s.createIndex('by-subject', 'subject_name');
        }
        if (!db.objectStoreNames.contains('topics')) {
          const s = db.createObjectStore('topics', { keyPath: 'id' });
          s.createIndex('by-source-file', 'source_file');
        }
        if (!db.objectStoreNames.contains('reviewResults')) {
          const s = db.createObjectStore('reviewResults', { keyPath: 'key' });
          s.createIndex('by-user-subject', ['userId', 'subject']);
        }
        if (!db.objectStoreNames.contains('bookmarks')) {
          const s = db.createObjectStore('bookmarks', { keyPath: 'key' });
          s.createIndex('by-user-subject', ['userId', 'subject']);
          s.createIndex('by-user', 'userId');
        }
        if (!db.objectStoreNames.contains('examAttempts')) {
          const s = db.createObjectStore('examAttempts', { keyPath: 'localId' });
          s.createIndex('by-user', 'userId');
        }
        if (!db.objectStoreNames.contains('syncQueue')) {
          const s = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
          s.createIndex('by-status', 'status');
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta');
        }
      },
    });
  }
  return dbPromise;
}

// Ключи для reviewResults/bookmarks состоят вручную (а не через keyPath-функцию, чтобы не
// зависеть от версии idb) — но чтобы не дублировать логику построения ключа по всему коду,
// собираем его в одном месте.
export function compositeKey(userId: string, subject: string, questionId: number): string {
  return `${userId}:${subject}:${questionId}`;
}
