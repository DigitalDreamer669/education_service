import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { QuestionCard } from '../components/QuestionCard';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { useQuestions } from '../hooks/useQuestions';
import { useTopics } from '../hooks/useTopics';
import { getSubject } from '../config/subjects';
import { buildDefinitionIndex, matchesSearch, searchDefinitions } from '../lib/parse';
import {
  askAi,
  getAiSearchCooldownMs,
  AiSearchRateLimitError,
  AiSearchConfigError,
  type AiExplanation,
} from '../lib/aiSearch';
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

  // ИИ-поиск: отдельные хуки объявлены здесь (а не ниже, рядом с обработчиком),
  // чтобы порядок вызова хуков не зависел от раннего return ниже.
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AiExplanation | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiCooldownMs, setAiCooldownMs] = useState(0);
  const aiQueryRef = useRef('');

  // Тикаем раз в секунду, пока действует троттлинг, только чтобы обновить
  // подпись на кнопке — сам троттлинг живёт в lib/aiSearch.ts, а не здесь.
  useEffect(() => {
    if (aiCooldownMs <= 0) return;
    const t = setInterval(() => {
      const remaining = getAiSearchCooldownMs();
      setAiCooldownMs(remaining);
    }, 250);
    return () => clearInterval(t);
  }, [aiCooldownMs]);

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

  // --- ИИ-поиск: полностью отдельный от поиска выше, включается только вручную ---
  // (по нажатию кнопки), никогда не запускается автоматически при вводе текста
  // и никак не влияет на локальный поиск по вопросам/конспектам.
  // (хуки состояния для него объявлены выше, до раннего return)
  async function handleAskAi() {
    const trimmed = query.trim();
    if (!trimmed || aiLoading) return;

    setAiLoading(true);
    setAiError(null);
    aiQueryRef.current = trimmed;

    try {
      const result = await askAi(trimmed);
      // Если пользователь успел изменить запрос, пока ответ летел — не подсовываем
      // устаревший результат под новым текстом в поле поиска.
      if (aiQueryRef.current === trimmed) setAiResult(result);
    } catch (e) {
      if (e instanceof AiSearchRateLimitError) {
        setAiCooldownMs(e.waitMs);
        setAiError(e.message);
      } else if (e instanceof AiSearchConfigError) {
        setAiError(e.message);
      } else {
        setAiError(e instanceof Error ? e.message : 'Не удалось получить ответ от ИИ');
      }
    } finally {
      setAiLoading(false);
    }
  }

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

          {query.trim() && (
            <div className="ai-search">
              <button
                type="button"
                className="ai-search__button"
                disabled={!query.trim() || aiLoading || aiCooldownMs > 0}
                onClick={handleAskAi}
              >
                {aiLoading
                  ? 'Спрашиваем ИИ…'
                  : aiCooldownMs > 0
                    ? `Подождите ${Math.ceil(aiCooldownMs / 1000)} с…`
                    : '✨ Спросить ИИ'}
              </button>
              <span className="ai-search__hint">Не нашли нужное? Спросите ИИ отдельно — это не связано с поиском выше.</span>

              {aiError && <p className="hint hint--error ai-search__error">{aiError}</p>}

              {aiResult && !aiLoading && (
                <div className="ai-search__result">
                  {aiResult.summary && (
                    <div className="ai-group">
                      <h3 className="ai-group__title">Кратко</h3>
                      <p>{aiResult.summary}</p>
                    </div>
                  )}
                  {aiResult.definition && (
                    <div className="ai-group">
                      <h3 className="ai-group__title">Определение</h3>
                      <MarkdownRenderer content={aiResult.definition} />
                    </div>
                  )}
                  {aiResult.explanation && (
                    <div className="ai-group">
                      <h3 className="ai-group__title">Объяснение</h3>
                      <MarkdownRenderer content={aiResult.explanation} />
                    </div>
                  )}
                  {aiResult.example && (
                    <div className="ai-group">
                      <h3 className="ai-group__title">Пример</h3>
                      <MarkdownRenderer content={aiResult.example} />
                    </div>
                  )}
                  {aiResult.related.length > 0 && (
                    <div className="ai-group">
                      <h3 className="ai-group__title">Связанные термины</h3>
                      <div className="ai-group__related">
                        {aiResult.related.map((term) => (
                          <span key={term} className="ai-related-chip">
                            {term}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="ai-search__disclaimer mono">Ответ сгенерирован ИИ и может содержать неточности.</p>
                </div>
              )}
            </div>
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
