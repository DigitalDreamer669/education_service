import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import './Layout.css';

interface LayoutProps {
  children: ReactNode;
  crumbs?: { label: string; to?: string }[];
}

export function Layout({ children, crumbs }: LayoutProps) {
  const { user, profile, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="layout">
      <header className="topbar">
        <div className="container topbar__inner">
          <Link to="/" className="topbar__brand">
            <span className="topbar__mark">01</span>
            <span>Подготовка к экзамену</span>
          </Link>

          {crumbs && crumbs.length > 0 && (
            <nav className="crumbs" aria-label="Навигация">
              {crumbs.map((c, i) => (
                <span key={i} className="crumbs__item">
                  <span className="crumbs__sep">/</span>
                  {c.to ? <Link to={c.to}>{c.label}</Link> : <span className="crumbs__current">{c.label}</span>}
                </span>
              ))}
            </nav>
          )}

          <div className="topbar__auth">
            {user ? (
              <>
                <span className="topbar__user">
                  {profile?.display_name || 'Пользователь'}
                </span>
                <button onClick={handleLogout} className="btn btn--ghost" style={{ padding: '4px 10px', fontSize: '13px' }}>
                  Выйти
                </button>
              </>
            ) : (
              <Link to="/login" className="btn btn--primary" style={{ padding: '4px 12px', fontSize: '13px' }}>
                Войти
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="content container">{children}</main>

      <footer className="footer container">
        <span>Данные — из Supabase · прогресс сохраняется на сервере</span>
      </footer>
    </div>
  );
}
