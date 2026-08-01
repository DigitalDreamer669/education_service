import { createContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

interface Profile {
  id: string;
  display_name: string;
}

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, display_name: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  loading: true,
  login: async () => {},
  signup: async () => {},
  logout: async () => {},
});

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthContextProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Загружаем профиль пользователя из БД
  async function fetchProfile(uid: string) {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .single();
      if (data && 'id' in data) setProfile(data as Profile);
    } catch {
      // молча игнорируем — профиль может ещё не существовать
    }
  }

  useEffect(() => {
    setLoading(true);

    // Восстанавливаем сессию из localStorage (Supabase делает это автоматически)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      setLoading(false);
    });

    // Слушаем изменения auth состояния
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => subscription?.unsubscribe();
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
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
