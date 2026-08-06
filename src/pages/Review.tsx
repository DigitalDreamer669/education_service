import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { QuestionCard } from '../components/QuestionCard';
import { ProgressGraph } from '../components/ProgressGraph';
import { useQuestions } from '../hooks/useQuestions';
import { getSubject } from '../config/subjects';
import { shuffle } from '../lib/parse';
import { shouldIgnoreShortcut } from '../lib/keyboard';
import type { Question, QuestionResult } from '../types';
import './Review.css';

export default function Review() {
  const { subject } = useParams();
  const config = getSubject(subject);
  const { questions } = useQuestions(config?.slug);

  // Server-side progress
  const [progressResults, setProgressResults] = useState<Record<number, QuestionResult>>({});
  const [progressLoading, setProgressLoading] = useState(true);
  const [progressError, setProgressError] = useState<string | null>(null);

  // Bookmarks (loaded from server)
  const [bookmarkedIds, setBookmarkedIds] = useState<number[]>([]);
  const [bookmarkLoading, setBookmarkLoading] = useState(true);

  // Local state for current session
  const [order, setOrder] = useState<Question[]>([]);
  const [currentId, setCurrentId] = useState<number | null>(null);

  useEffect(() => {
    if (!config || questions.length === 0) return;
    setOrder(shuffle(questions));

    // Load server progress
    import('../lib/serverProgress').then(({ loadReviewProgress }) => {
      loadReviewProgress(cfg.slug).then((data) => {
        setProgressResults(data);
        setProgressLoading(false);
      }).catch(() => {
        setProgressError('Не удалось загрузить прогресс с сервера');
        setProgressLoading(false);
      });
    });

    // Load bookmarks for this subject
    import('../lib/serverProgress').then(({ loadBookmarks }) => {
      loadBookmarks(cfg.slug).then((ids) => setBookmarkedIds(ids)).catch(console.error).finally(() => setBookmarkLoading(false));
    });
  }, [config, questions]);

  if (!config) return <Navigate to="/" replace />;

  // Capture config so TypeScript knows it's non-null inside async callbacks
  const cfg = config;

  const progressItems = order.map((q) => ({
    id: q.id,
    state: (progressResults[q.id] ?? 'pending') as 'pending' | 'correct' | 'incorrect',
  }));

  const currentIndex = currentId ? order.findIndex((q) => q.id === currentId) : -1;
  const current = currentIndex >= 0 ? order[currentIndex] : order[0];

  async function handleAnswered(correct: boolean) {
    if (!config || !current) return;
    const result: QuestionResult = correct ? 'correct' : 'incorrect';
    setProgressResults((prev) => ({ ...prev, [current.id]: result }));

    // Save to server (non-blocking — don't block UI on failure)
    import('../lib/serverProgress').then(({ saveReviewResult }) => {
      saveReviewResult(cfg.slug, current.id, result).catch(() => {
        setProgressError('Не удалось сохранить ответ');
      });
    });

    // Auto-bookmark incorrect answers
    if (!correct && !bookmarkedIds.includes(current.id)) {
      import('../lib/serverProgress').then(({ toggleBookmark }) => {
        toggleBookmark(cfg.slug, current.id).then((ok) => {
          if (ok) setBookmarkedIds((prev) => [...prev, current.id]);
        });
      });
    }
  }

  function goNext() {
    if (!current) return;
    const idx = order.findIndex((q) => q.id === current.id);
    const next = order[(idx + 1) % order.length];
    setCurrentId(next.id);
  }

  function goPrev() {
    if (!current) return;
    const idx = order.findIndex((q) => q.id === current.id);
    const prev = order[(idx - 1 + order.length) % order.length];
    setCurrentId(prev.id);
  }

  // Горячие клавиши: ← / → — предыдущий/следующий вопрос. Enter продвигает
  // дальше, только если текущий вопрос уже отвечен — пока ответ не выбран
  // и не проверен, Enter обрабатывает сама карточка вопроса (выбор/проверка).
  // Это же условие делает поведение независимым от порядка срабатывания
  // двух отдельных обработчиков keydown (страница и карточка).
  useEffect(() => {
    if (!current || order.length === 0) return;
    const alreadyAnswered = progressResults[current.id] !== undefined;

    function handleKeyDown(e: KeyboardEvent) {
      if (shouldIgnoreShortcut(e)) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
        return;
      }

      if (e.key === 'Enter' && alreadyAnswered) {
        e.preventDefault();
        goNext();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, order, progressResults]);

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

  function handleReset() {
    setProgressResults({});
    setOrder(shuffle(questions));
    setCurrentId(null);
  }

  const doneCount = useMemo(
    () => order.filter((q) => progressResults[q.id]).length,
    [order, progressResults]
  );

  return (
    <Layout crumbs={[{ label: config.shortName, to: `/${config.slug}` }, { label: 'Повторение' }]}>
      {(progressLoading || bookmarkLoading) && <p className="hint">Загружаем…</p>}
      {progressError && <p className="hint hint--error">{progressError}</p>}

      {!progressLoading && !bookmarkLoading && order.length > 0 && current && (
        <>
          <div className="review-head">
            <span className="eyebrow">{config.name}</span>
            <h1>Повторение — все вопросы вперемешку</h1>
          </div>

          <ProgressGraph items={progressItems} currentId={current.id} onSelect={setCurrentId} />

          <QuestionCard
            key={current.id}
            question={current}
            indexLabel={`вопрос ${(order.findIndex((q) => q.id === current.id) + 1)} / ${order.length}`}
            onAnswered={handleAnswered}
            isBookmarked={bookmarkedIds.includes(current.id)}
            onToggleBookmark={() => handleToggleBookmark(current.id)}
            keyboardEnabled
          />

          <div className="review-nav">
            <button className="btn btn--ghost" onClick={goPrev}>
              Предыдущий
              <span className="kbd" aria-hidden="true">←</span>
            </button>
            <button className="btn btn--primary" onClick={goNext}>
              Следующий вопрос
              <span className="kbd" aria-hidden="true">→</span>
            </button>
            <span className="review-nav__status mono">{doneCount} / {order.length} отвечено</span>
            {doneCount > 0 && (
              <button className="btn btn--ghost" onClick={handleReset}>
                Сбросить прогресс
              </button>
            )}
          </div>
        </>
      )}
    </Layout>
  );
}
