import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import './Login.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setError(null);
    setSubmitting(true);

    try {
      await login(email.trim(), password);
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Не удалось войти';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login">
      <div className="login__card">
        <h1 className="login__title">Вход</h1>
        <p className="login__subtitle">Введите email и пароль для доступа к материалам</p>

        {error && <div className="login__error">{error}</div>}

        <form className="login__form" onSubmit={handleSubmit}>
          <div className="login__field">
            <label htmlFor="email" className="login__label">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
              className="login__input"
            />
          </div>

          <div className="login__field">
            <label htmlFor="password" className="login__label">Пароль</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              className="login__input"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || !email.trim() || !password}
            className="btn btn--primary login__submit"
          >
            {submitting ? 'Вход…' : 'Войти'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <Link to="/" className="login__toggle">← На главную</Link>
        </div>
      </div>
    </div>
  );
}
