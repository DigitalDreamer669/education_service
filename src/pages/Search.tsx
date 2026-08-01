import { useEffect, useMemo, useState } from 'react';
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

  // Bookmarks (loaded from server)
  const [bookmarkedIds, setBookmarkedIds] = useState<number[]>([]);
  const [bookmarkLoading, setBookmarkLoading] = useState(true);

  if (!config) return <Navigate to="/" replace />;

  // Capture config so TypeScript knows it's non-null inside async callbacks
  const cfg = config;

  useEffect(() => {
    import('../lib/serverProgress').then(({ loadBookmarks }) => {
      loadBookmarks(cfg.slug).then((ids) => setBookmarkedIds(ids)).catch(console.error).finally(() => setBookmarkLoading(false));
    });
  }, [config]);

  async function handleToggleBookmark(questionId: number) {
    const ok = await import('../lib/serverProgress').then(
      ({ toggleBookmark }) => toggleBookmark(cfg.slug, questionId)
    );
    if (ok) {
      setBookmarkedIds((prev) =>
        prev.includes(questionId) ? prev.filter((id) => id !== questionId) : [...prev, questionId]
      );
    }
  }

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return questions.filter((q) => matchesSearch(q, query));
  }, [questions, query]);

  return (
    <Layout crumbs={[{ label: config.shortName, to: `/${config.slug}` }, { label: 'Поиск' }]}>
      {(loading || bookmarkLoading) && <p className="hint">Загружаем…</p>}
      {error && <p className="hint hint--error">Ошибка загрузки: {error}</p>}

      {!loading && !bookmarkLoading && (
        <>
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

          {!loading && query.trim() && (
            <p className="search-count mono">
              {results.length} {results.length === 1 ? 'совпадение' : 'совпадений'}
            </p>
          )}

          <div className="search-results">
            {results.map((q) => (
              <QuestionCard
                key={q.id}
                question={q}
                revealed
                isBookmarked={bookmarkedIds.includes(q.id)}
                onToggleBookmark={() => handleToggleBookmark(q.id)}
              />
            ))}
          </div>
        </>
      )}
    </Layout>
  );
}
