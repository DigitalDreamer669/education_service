import { useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { QuestionCard } from '../components/QuestionCard';
import { Timer } from '../components/Timer';
import { ProgressGraph } from '../components/ProgressGraph';
import { useQuestions } from '../hooks/useQuestions';
import { getSubject } from '../config/subjects';
import { shuffle } from '../lib/parse';
import type { Question } from '../types';
import './Exam.css';

type Phase = 'setup' | 'running' | 'finished';

interface Attempt {
  question: Question;
  result: 'correct' | 'incorrect' | null;
  selected: string[];
}

export default function Exam() {
  const { subject } = useParams();
  const config = getSubject(subject);
  const { questions, loading, error } = useQuestions(config?.slug);

  const [phase, setPhase] = useState<Phase>('setup');
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionKey, setSessionKey] = useState(0);

  if (!config) return <Navigate to="/" replace />;

  function startExam() {
    const pool = shuffle(questions).slice(0, config!.exam.questionCount);
    setAttempts(pool.map((q) => ({ question: q, result: null, selected: [] })));
    setCurrentIndex(0);
    setSessionKey((k) => k + 1);
    setPhase('running');
  }

  function handleAnswered(correct: boolean, selected: string[]) {
    setAttempts((prev) => {
      const next = [...prev];
      next[currentIndex] = { ...next[currentIndex], result: correct ? 'correct' : 'incorrect', selected };
      return next;
    });
  }

  function finishExam() {
    setPhase('finished');
  }

  function goNext() {
    if (currentIndex < attempts.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      finishExam();
    }
  }

  const score = useMemo(
    () => attempts.filter((a) => a.result === 'correct').length,
    [attempts]
  );
  const answeredCount = attempts.filter((a) => a.result !== null).length;

  const progressItems = attempts.map((a) => ({
    id: a.question.id,
    state: (a.result ?? 'pending') as 'pending' | 'correct' | 'incorrect',
  }));

  if (phase === 'setup') {
    return (
      <Layout crumbs={[{ label: config.shortName, to: `/${config.slug}` }, { label: 'Экзамен' }]}>
        {loading && <p className="hint">Загружаем вопросы…</p>}
        {error && <p className="hint hint--error">Ошибка загрузки: {error}</p>}
        {!loading && !error && (
          <div className="exam-setup">
            <span className="eyebrow">{config.name}</span>
            <h1>Режим экзамена</h1>
            <div className="exam-setup__facts">
              <div className="fact">
                <span className="fact__value mono">{config.exam.questionCount}</span>
                <span className="fact__label">вопросов</span>
              </div>
              <div className="fact">
                <span className="fact__value mono">{config.exam.minutes}</span>
                <span className="fact__label">минут</span>
              </div>
              <div className="fact">
                <span className="fact__value mono">{questions.length}</span>
                <span className="fact__label">в базе по предмету</span>
              </div>
            </div>
            <p className="exam-setup__note">
              Вопросы выбираются случайно и не повторяются в рамках попытки. Таймер стартует сразу
              после начала — на паузу не ставится.
            </p>
            <button className="btn btn--primary" onClick={startExam} disabled={questions.length === 0}>
              Начать экзамен
            </button>
          </div>
        )}
      </Layout>
    );
  }

  if (phase === 'running') {
    const attempt = attempts[currentIndex];
    return (
      <Layout crumbs={[{ label: config.shortName, to: `/${config.slug}` }, { label: 'Экзамен' }]}>
        <div className="exam-run__bar">
          <span className="exam-run__progress mono">
            Вопрос {currentIndex + 1} / {attempts.length}
          </span>
          <Timer totalSeconds={config.exam.minutes * 60} onExpire={finishExam} />
        </div>

        <QuestionCard
          key={`${sessionKey}-${attempt.question.id}`}
          question={attempt.question}
          indexLabel={`${currentIndex + 1} / ${attempts.length}`}
          onAnswered={handleAnswered}
        />

        <div className="exam-run__nav">
          <button
            className="btn btn--primary"
            onClick={goNext}
            disabled={attempt.result === null}
          >
            {currentIndex < attempts.length - 1 ? 'Следующий вопрос' : 'Завершить экзамен'}
          </button>
          {answeredCount < attempts.length && (
            <button className="btn btn--ghost" onClick={finishExam}>
              Завершить досрочно
            </button>
          )}
        </div>
      </Layout>
    );
  }

  // finished
  const percent = attempts.length > 0 ? Math.round((score / attempts.length) * 100) : 0;
  return (
    <Layout crumbs={[{ label: config.shortName, to: `/${config.slug}` }, { label: 'Экзамен' }]}>
      <div className="exam-result">
        <span className="eyebrow">Результат</span>
        <h1>
          {score} из {attempts.length} <span className="exam-result__pct mono">({percent}%)</span>
        </h1>
        <p className="exam-result__note">
          {answeredCount < attempts.length
            ? `Завершено досрочно — без ответа осталось ${attempts.length - answeredCount}.`
            : 'Экзамен пройден полностью.'}
        </p>
        <button className="btn btn--primary" onClick={startExam}>
          Пройти заново (новая выборка)
        </button>
      </div>

      <ProgressGraph items={progressItems} />

      <div className="exam-review">
        <h2>Разбор вопросов</h2>
        {attempts.map((a, i) => (
          <QuestionCard
            key={a.question.id}
            question={a.question}
            indexLabel={`${i + 1} / ${attempts.length}`}
            revealed
            initialSelected={a.selected}
          />
        ))}
      </div>
    </Layout>
  );
}
