import { useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { QuestionCard } from '../components/QuestionCard';
import { useQuestions } from '../hooks/useQuestions';
import { getSubject } from '../config/subjects';
import { matchesSearch } from '../lib/parse';
import './Search.css';

export default function Search() {
  const { subject } = useParams();
  const config = getSubject(subject);
  const { questions, loading, error } = useQuestions(config?.slug);
  const [query, setQuery] = useState('');

  if (!config) return <Navigate to="/" replace />;

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return questions.filter((q) => matchesSearch(q, query));
  }, [questions, query]);

  return (
    <Layout crumbs={[{ label: config.shortName, to: `/${config.slug}` }, { label: 'Поиск' }]}>
      <div className="search-head">
        <span className="eyebrow">{config.name}</span>
        <h1>Поиск вопросов</h1>
        <p className="search-head__sub">
          Точное совпадение фразы не требуется — просто введите одно-два ключевых слова.
        </p>
      </div>

      <input
        autoFocus
        type="search"
        className="search-input"
        placeholder="Например: MRP, дисперсия, критерий Стьюдента…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {loading && <p className="hint">Загружаем вопросы…</p>}
      {error && <p className="hint hint--error">Ошибка загрузки: {error}</p>}

      {!loading && query.trim() && (
        <p className="search-count mono">
          {results.length} {results.length === 1 ? 'совпадение' : 'совпадений'}
        </p>
      )}

      <div className="search-results">
        {results.map((q) => (
          <QuestionCard key={q.id} question={q} revealed />
        ))}
      </div>
    </Layout>
  );
}
