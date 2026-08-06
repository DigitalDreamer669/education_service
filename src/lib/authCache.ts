/**
 * Локальный кэш "последнего известного" авторизованного пользователя.
 *
 * ПРОБЛЕМА, которую это решает: Supabase access token живёт ограниченное время
 * (по умолчанию 3600 c). GoTrue-клиент хранит refresh token в localStorage и сам
 * НЕ удаляет его при сетевых сбоях (см. auth-js: _callRefreshToken пропускает
 * _removeSession для retryable/сетевых ошибок) — НО если access token уже реально
 * истёк (а не просто "скоро истечёт") и обновить его не удалось из-за отсутствия
 * сети, supabase.auth.getSession() вернёт { session: null }, хотя пользователь
 * никуда не выходил и данные в IndexedDB на месте. Без этого кэша это выглядело
 * бы как "приложение разлогинило меня офлайн" — ровно то, чего требование ТЗ
 * (пользоваться сайтом офлайн спустя сутки+) явно просит избежать.
 *
 * Правило источника истины: кэш обновляется, когда supabase-js сообщает о РЕАЛЬНОЙ
 * сессии (SIGNED_IN/TOKEN_REFRESHED/INITIAL_SESSION с session), и очищается только
 * по событию SIGNED_OUT — а это событие auth-js гарантированно шлёт как при явном
 * signOut(), так и при подтверждённо невалидном (не сетевом) refresh token
 * (см. GoTrueClient._removeSession). Значит опираться на присутствие/отсутствие
 * этого кэша безопаснее, чем эвристику navigator.onLine.
 */

import { supabase } from './supabase';

const STORAGE_KEY = 'edu_last_auth_user_v1';

export interface CachedUser {
  id: string;
  email: string | null;
  displayName: string | null;
}

export function saveCachedUser(user: CachedUser): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } catch {
    // localStorage недоступен (приватный режим и т.п.) — не критично,
    // просто не будет офлайн-фолбэка после реального разлогина браузера.
  }
}

export function getCachedUser(): CachedUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.id === 'string') return parsed as CachedUser;
    return null;
  } catch {
    return null;
  }
}

export function clearCachedUser(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Только display_name (обновляется отдельно от user, т.к. приходит из profiles с задержкой). */
export function updateCachedDisplayName(displayName: string | null): void {
  const cached = getCachedUser();
  if (!cached) return;
  saveCachedUser({ ...cached, displayName });
}

/**
 * Единая точка получения id текущего пользователя для чтения/записи офлайн-данных
 * (см. lib/serverProgress.ts). Сначала пробует живую сессию (getSession() не бьёт
 * в сеть сам по себе — читает localStorage и рефрешит токен только если он
 * реально истёк); если сессии нет — берёт последнего известного пользователя из
 * кэша. Это тот же fallback, что и в AuthContext, поэтому UI (какой user залогинен)
 * и данные (чьи вопросы/прогресс читаются) никогда не расходятся между собой.
 */
export async function getEffectiveUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user.id) return data.session.user.id;
  } catch {
    // сетевая ошибка при попытке рефреша — падаем на кэш ниже
  }
  return getCachedUser()?.id ?? null;
}
