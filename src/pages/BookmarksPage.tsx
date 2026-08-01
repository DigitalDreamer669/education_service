import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { QuestionCard } from '../components/QuestionCard';
import { useQuestions } from '../hooks/useQuestions';
import { getSubject, SUBJECTS } from '../config/subjects';
import './BookmarksPage.css';

export default function BookmarksPage() {
  const { subject: currentSubject } = useParams();
  const config = getSubject(currentSubject);

  // Filter state — which subject's bookmarks we're viewing
  const [filterSubject, setFilterSubject] = useState<string | null>(currentSubject ?? null);
  const [bookmarkedIds, setBookmarkedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  // Load questions for the filtered subject
  const { questions: allQuestions } = useQuestions(filterSubject ?? undefined);

  if (!config) return <Navigate to="/" replace />;

  useEffect(() => {
    import('../lib/serverProgress').then(({ loadBookmarks }) => {
      setLoading(true);
      loadBookmarks(filterSubject!).then((ids) => setBookmarkedIds(ids)).catch(console.error).finally(() => setLoading(false));
    });
  }, [filterSubject]);

  // Match bookmarked IDs to full question objects
  const bookmarkedQuestions = useMemo(() => {
    if (!allQuestions.length || !bookmarkedIds.length) return [];
    const idSet = new Set(bookmarkedIds);
    return allQuestions.filter((q) => idSet.has(q.id));
  }, [allQuestions, bookmarkedIds]);

  async function handleToggleBookmark(questionId: number) {
    if (!filterSubject) return;
    const ok = await import('../lib/serverProgress').then(
      ({ toggleBookmark }) => toggleBookmark(filterSubject!, questionId)
    );
    if (ok) {
      setBookmarkedIds((prev) => prev.filter((id) => id !== questionId));
    }
  }

  return (
    <Layout crumbs={[{ label: config.shortName }, { label: 'Закладки' }]}>
      <div className="bookmarks-page">
        <span className="eyebrow">{config.name}</span>
        <h1>Закладки</h1>

        {/* Subject filter */}
        <div className="bookmarks-filter">
          <label htmlFor="bookmark-subject" className="bookmarks-filter__label">
            Предмет:
          </label>
          <select
            id="bookmark-subject"
            className="bookmarks-filter__select"
            value={filterSubject ?? ''}
            onChange={(e) => setFilterSubject(e.target.value || null)}
          >
            {SUBJECTS.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.shortName}
              </option>
            ))}
          </select>
        </div>

        {/* Loading / empty state */}
        {loading && <p className="hint">Загружаем…</p>}
        {!loading && bookmarkedQuestions.length === 0 && (
          <p className="hint">Нет закладок. Нажмите на иконку &laquo;закладка&raquo; у любого вопроса, чтобы добавить его сюда.</p>
        )}

        {/* Bookmarked questions */}
        {!loading && bookmarkedQuestions.length > 0 && (
          <div className="bookmarks-list">
            {bookmarkedQuestions.map((q) => (
              <QuestionCard
                key={q.id}
                question={q}
                revealed
                isBookmarked
                onToggleBookmark={() => handleToggleBookmark(q.id)}
              />
            ))}
          </div>
        )}

        <p className="bookmarks-count mono">{bookmarkedQuestions.length} {bookmarkedQuestions.length === 1 ? 'вопрос' : bookmarkedQuestions.length < 6 ? 'вопроса' : 'вопросов'}</p>
      </div>
    </Layout>
  );
}
