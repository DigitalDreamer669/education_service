import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { QuestionCard } from '../components/QuestionCard';
import { ProgressGraph } from '../components/ProgressGraph';
import { useQuestions } from '../hooks/useQuestions';
import { getSubject } from '../config/subjects';
import { shuffle } from '../lib/parse';
import type { Question, QuestionResult } from '../types';
import './Review.css';

export default function Review() {
  const { subject } = useParams();
  const config = getSubject(subject);
  const { questions, loading: questionsLoading, error: questionsError } = useQuestions(config?.slug);

  // Server-side progress
  const [progressResults, setProgressResults] = useState<Record<number, QuestionResult>>({});
  const [progressLoading, setProgressLoading] = useState(true);
  const [progressError, setProgressError] = useState<string | null>(null);

  // Local state for current session
  const [order, setOrder] = useState<Question[]>([]);
  const [currentId, setCurrentId] = useState<number | null>(null);

  useEffect(() => {
    if (!config || questions.length === 0) return;
    setOrder(shuffle(questions));

    // Load server progress
    import('../lib/serverProgress').then(({ loadReviewProgress }) => {
      loadReviewProgress(config.slug).then((data) => {
        setProgressResults(data);
        setProgressLoading(false);
      }).catch(() => {
        setProgressError('Не удалось загрузить прогресс с сервера');
        setProgressLoading(false);
      });
    });
  }, [config, questions]);

  if (!config) return <Navigate to="/" replace />;

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
      saveReviewResult(config.slug, current.id, result).catch(() => {
        setProgressError('Не удалось сохранить ответ');
      });
    });
  }

  function goNext() {
    if (!current) return;
    const idx = order.findIndex((q) => q.id === current.id);
    const next = order[(idx + 1) % order.length];
    setCurrentId(next.id);
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
      {progressLoading && <p className="hint">Загружаем прогресс…</p>}
      {progressError && <p className="hint hint--error">{progressError}</p>}

      {!progressLoading && order.length > 0 && current && (
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
          />

          <div className="review-nav">
            <button className="btn btn--primary" onClick={goNext}>
              Следующий вопрос
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
