import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import './Layout.css';

interface LayoutProps {
  children: ReactNode;
  crumbs?: { label: string; to?: string }[];
}

export function Layout({ children, crumbs }: LayoutProps) {
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
        </div>
      </header>
      <main className="content container">{children}</main>
      <footer className="footer container">
        <span>Данные — из Supabase · прогресс режима «Повторение» хранится локально в этом браузере</span>
      </footer>
    </div>
  );
}
