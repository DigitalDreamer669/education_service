import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { QuestionCard } from '../components/QuestionCard';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { useQuestions } from '../hooks/useQuestions';
import { useTopics } from '../hooks/useTopics';
import { getSubject } from '../config/subjects';
import { buildDefinitionIndex, matchesSearch, searchDefinitions } from '../lib/parse';
import './Search.css';

// Ограничиваем число показываемых кусков конспектов, чтобы не заваливать
// страницу при коротких/частых запросах (например, при вводе одной буквы).
const MAX_DEFINITION_RESULTS = 20;

export default function Search() {
  const { subject } = useParams();
  const config = getSubject(subject);
  const { questions, loading, error } = useQuestions(config?.slug);
  const { topics, loading: topicsLoading } = useTopics(config?.slug, config?.topicsSourceFile);
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

  // Поиск по конспектам полностью независим от поиска вопросов выше:
  // отдельный индекс, отдельный memo, отдельная секция рендера — так что
  // логику/поведение поиска по вопросам это никак не задевает.
  const definitionIndex = useMemo(() => buildDefinitionIndex(topics), [topics]);

  const definitionResults = useMemo(() => {
    if (!query.trim()) return [];
    return searchDefinitions(definitionIndex, query).slice(0, MAX_DEFINITION_RESULTS);
  }, [definitionIndex, query]);

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
              {results.length} {results.length === 1 ? 'совпадение' : 'совпадений'} среди вопросов
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

          {query.trim() && (
            <div className="def-section">
              <h2 className="def-section__title">Определения из конспектов</h2>

              {topicsLoading && <p className="hint">Загружаем конспекты…</p>}

              {!topicsLoading && (
                <>
                  <p className="search-count mono">
                    {definitionResults.length}{' '}
                    {definitionResults.length === 1 ? 'совпадение' : 'совпадений'} в конспектах
                    {definitionResults.length === MAX_DEFINITION_RESULTS ? ' (показаны первые)' : ''}
                  </p>

                  <div className="def-results">
                    {definitionResults.map((chunk) => (
                      <div key={chunk.id} className="def-card">
                        <div className="def-card__meta mono">
                          <span>Тема {chunk.topicNumber || chunk.topicId}: {chunk.topicTitle}</span>
                          {chunk.heading && <span className="def-card__heading"> · {chunk.heading}</span>}
                        </div>
                        <div className="def-card__body">
                          <MarkdownRenderer content={chunk.text} />
                        </div>
                        <Link className="def-card__link" to={`/${config.slug}/topics/${chunk.topicId}`}>
                          Открыть тему целиком →
                        </Link>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
