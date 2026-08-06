import { createContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { prefetchAllSubjects } from '../lib/prefetch';
import { saveCachedUser, getCachedUser, clearCachedUser, updateCachedDisplayName } from '../lib/authCache';
import type { Session } from '@supabase/supabase-js';

/**
 * Намеренно НЕ используем полный тип `User` из supabase-js: в приложении реально
 * читается только `.id` (см. OfflineStatus.tsx, serverProgress.ts) и опционально
 * email. Лёгкий тип позволяет одинаково представлять и "живого" пользователя из
 * сессии, и офлайн-фолбэк из локального кэша (см. ниже) без искусственно
 * придуманных полей (app_metadata и т.п.), которых у нас на самом деле нет.
 */
interface AppUser {
  id: string;
  email: string | null;
}

interface Profile {
  id: string;
  display_name: string;
}

interface AuthContextValue {
  user: AppUser | null;
  profile: Profile | null;
  loading: boolean;
  /**
   * true, если `user` восстановлен из локального кэша, а не из реально
   * подтверждённой Supabase-сессии — то есть токен нельзя было обновить (обычно
   * потому, что нет сети). Приложение в этом состоянии полностью функционально
   * (все данные уже локальны), но операции, требующие живого токена (сам вход,
   * первая загрузка ещё не закэшированного предмета), сети дождутся.
   */
  isOfflineSession: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, display_name: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  loading: true,
  isOfflineSession: false,
  login: async () => {},
  signup: async () => {},
  logout: async () => {},
});

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthContextProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOfflineSession, setIsOfflineSession] = useState(false);

  // Загружаем профиль пользователя из БД (офлайн — тихо не находит ничего нового,
  // на экране остаётся то, что было восстановлено из кэша ниже).
  async function fetchProfile(uid: string) {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .single();
      if (data && 'id' in data) {
        setProfile(data as Profile);
        updateCachedDisplayName((data as Profile).display_name ?? null);
      }
    } catch {
      // молча игнорируем — профиль может ещё не существовать, либо мы офлайн
    }
  }

  useEffect(() => {
    // Обрабатывает и первоначальное восстановление сессии, и все последующие
    // события. supabase-js шлёт 'INITIAL_SESSION' сразу при подписке (см.
    // GoTrueClient.onAuthStateChange), поэтому отдельный вызов getSession() при
    // монтировании не нужен — один код путь вместо двух гарантирует, что офлайн-
    // фолбэк ниже применяется одинаково и при старте, и при разрыве сети.
    function handleSession(event: string, session: Session | null) {
      if (session?.user) {
        // Есть подтверждённая живая сессия.
        const appUser: AppUser = { id: session.user.id, email: session.user.email ?? null };
        setUser(appUser);
        setIsOfflineSession(false);
        // displayName берём из уже сохранённого кэша (если есть) — актуальное
        // значение подтянет fetchProfile() ниже через updateCachedDisplayName().
        saveCachedUser({ id: appUser.id, email: appUser.email, displayName: getCachedUser()?.displayName ?? null });
        fetchProfile(appUser.id);
        // Заранее прогреваем офлайн-кэш всеми предметами, чтобы сайт полноценно
        // работал без сети даже для тем, которые пользователь ещё не открывал.
        void prefetchAllSubjects(appUser.id);
        setLoading(false);
        return;
      }

      if (event === 'SIGNED_OUT') {
        // Настоящий выход: либо явный logout(), либо supabase-js подтверждённо
        // (не по сетевой ошибке — см. auth-js GoTrueClient._callRefreshToken)
        // признал refresh token невалидным. См. lib/authCache.ts — это
        // единственное событие, по которому мы стираем офлайн-фолбэк.
        setUser(null);
        setProfile(null);
        setIsOfflineSession(false);
        clearCachedUser();
        setLoading(false);
        return;
      }

      // Сессии нет, но это НЕ подтверждённый выход — типичная причина: устройство
      // офлайн уже дольше времени жизни access token, и обновить его не вышло.
      // Не выкидываем пользователя из приложения: он уже был авторизован, а все
      // его данные (вопросы/конспекты/прогресс) лежат в IndexedDB локально.
      const cached = getCachedUser();
      if (cached) {
        setUser({ id: cached.id, email: cached.email });
        setProfile(cached.displayName ? { id: cached.id, display_name: cached.displayName } : null);
        setIsOfflineSession(true);
        // Не бьём в сеть намеренно (prefetchAllSubjects сам не делает ничего,
        // если isOnline() === false) — но пробуем тихо обновить профиль/сессию
        // на случай, если на самом деле сеть есть, а протух только кэш профиля.
        fetchProfile(cached.id);
      } else {
        setUser(null);
        setProfile(null);
        setIsOfflineSession(false);
      }
      setLoading(false);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleSession);
    return () => subscription?.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }

  async function signup(email: string, password: string, display_name: string) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name } },
    });
    if (error) throw new Error(error.message);
  }

  async function logout() {
    // В обычном случае signOut() сам снимает сессию и шлёт SIGNED_OUT (см.
    // handleSession выше), который чистит кэш. Но если access token уже реально
    // истёк и мы офлайн, внутренний getSession() внутри signOut() возвращает
    // ошибку до того, как GoTrue успевает снять локальную сессию (см. auth-js
    // GoTrueClient._signOut: ранний return при !isAuthSessionMissingError) — в
    // этом узком случае SIGNED_OUT не придёт. Поэтому чистим состояние и кэш
    // здесь напрямую и безусловно: "Выйти" должен работать как офлайн, так и
    // онлайн, независимо от того, что вернул сетевой вызов отзыва токена.
    try {
      await supabase.auth.signOut();
    } catch {
      // сетевая ошибка — не мешает локальному выходу ниже
    }
    setUser(null);
    setProfile(null);
    setIsOfflineSession(false);
    clearCachedUser();
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, isOfflineSession, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
