import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { QuestionCard } from '../components/QuestionCard';
import { ProgressGraph } from '../components/ProgressGraph';
import { useQuestions } from '../hooks/useQuestions';
import { getSubject } from '../config/subjects';
import { shuffle } from '../lib/parse';
import { loadProgress, resetProgress, saveResult, type QuestionResult } from '../lib/progress';
import type { Question } from '../types';
import './Review.css';

export default function Review() {
  const { subject } = useParams();
  const config = getSubject(subject);
  const { questions, loading, error } = useQuestions(config?.slug);

  const [order, setOrder] = useState<Question[]>([]);
  const [results, setResults] = useState<Record<number, QuestionResult>>({});
  const [currentId, setCurrentId] = useState<number | null>(null);

  useEffect(() => {
    if (!config || questions.length === 0) return;
    setOrder(shuffle(questions));
    setResults(loadProgress(config.slug));
  }, [config, questions]);

  if (!config) return <Navigate to="/" replace />;

  const progressItems = order.map((q) => ({
    id: q.id,
    state: (results[q.id] ?? 'pending') as 'pending' | 'correct' | 'incorrect',
  }));

  const currentIndex = currentId ? order.findIndex((q) => q.id === currentId) : -1;
  const current = currentIndex >= 0 ? order[currentIndex] : order[0];

  function handleAnswered(correct: boolean) {
    if (!config || !current) return;
    const result: QuestionResult = correct ? 'correct' : 'incorrect';
    saveResult(config.slug, current.id, result);
    setResults((prev) => ({ ...prev, [current.id]: result }));
  }

  function goNext() {
    if (!current) return;
    const idx = order.findIndex((q) => q.id === current.id);
    const next = order[(idx + 1) % order.length];
    setCurrentId(next.id);
  }

  function handleReset() {
    if (!config) return;
    resetProgress(config.slug);
    setResults({});
    setOrder(shuffle(questions));
    setCurrentId(null);
  }

  const doneCount = useMemo(
    () => order.filter((q) => results[q.id]).length,
    [order, results]
  );

  return (
    <Layout crumbs={[{ label: config.shortName, to: `/${config.slug}` }, { label: 'Повторение' }]}>
      {loading && <p className="hint">Загружаем вопросы…</p>}
      {error && <p className="hint hint--error">Ошибка загрузки: {error}</p>}

      {!loading && !error && order.length > 0 && current && (
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
