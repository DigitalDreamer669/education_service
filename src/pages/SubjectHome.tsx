import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { getSubject } from '../config/subjects';
import './SubjectHome.css';

const MODES = [
  {
    key: 'exam',
    title: 'Экзамен',
    description: 'Ограниченный набор вопросов, таймер, вопросы не повторяются.',
    tag: 'по регламенту',
  },
  {
    key: 'review',
    title: 'Повторение',
    description: 'Все вопросы по предмету вперемешку, без лимита времени и количества.',
    tag: 'без ограничений',
  },
  {
    key: 'search',
    title: 'Поиск вопросов',
    description: 'Ищите по ключевым словам — покажем ответ, пояснение и статистику.',
    tag: 'по базе вопросов',
  },
  {
    key: 'topics',
    title: 'Конспекты по темам',
    description: 'Краткая и полная версия материала по каждой теме курса.',
    tag: 'теория',
  },
] as const;

const EXTRA_MODES = [
  {
    key: 'bookmarks',
    title: 'Закладки',
    description: 'Вопросы, которые вы отметили как важные. Возвращайтесь к ним для повторения.',
    tag: 'свои вопросы',
  },
] as const;

export default function SubjectHome() {
  const { subject } = useParams();
  const config = getSubject(subject);

  // Counts for badges
  const [bookmarkCount, setBookmarkCount] = useState(0);
  const [difficultCount, setDifficultCount] = useState(0);
  const [countsLoading, setCountsLoading] = useState(true);

  if (!config) return <Navigate to="/" replace />;

  useEffect(() => {
    import('../lib/serverProgress').then(({ loadBookmarks, loadDifficultQuestions }) => {
      Promise.allSettled([
        loadBookmarks(config.slug).then((ids) => setBookmarkCount(ids.length)),
        loadDifficultQuestions(config.slug).then((ids) => setDifficultCount(ids.length)),
      ]).finally(() => setCountsLoading(false));
    });
  }, [config]);

  const extraModes = EXTRA_MODES.map((m) => ({
    ...m,
    badge: countsLoading ? undefined : `${bookmarkCount} ${pluralWord(bookmarkCount, ['закладка', 'закладки', 'закладок'])}`,
  }));

  return (
    <Layout crumbs={[{ label: config.shortName }]}>
      <div className="subj-hero">
        <span className="eyebrow">{config.name}</span>
        <h1>Что тренируем?</h1>
      </div>

      <div className="mode-grid">
        {MODES.map((m) => (
          <Link key={m.key} to={`/${config.slug}/${m.key}`} className="mode-card">
            <div className="mode-card__top">
              <h2>{m.title}</h2>
              <span className="mode-card__tag">{m.tag}</span>
            </div>
            <p>{m.description}</p>
            {m.key === 'exam' && (
              <div className="mode-card__stats mono">
                {config.exam.questionCount} вопросов · {config.exam.minutes} мин
              </div>
            )}
          </Link>
        ))}

        {/* Закладки */}
        {extraModes.map((m) => (
          <Link key={m.key} to={`/${config.slug}/${m.key}`} className="mode-card mode-card--extra">
            <div className="mode-card__top">
              <h2>{m.title}</h2>
              <span className="mode-card__tag">{m.tag}</span>
            </div>
            <p>{m.description}</p>
            {!countsLoading && m.badge && (
              <div className="mode-card__stats mono">
                {difficultCount > 0 ? `${difficultCount} ${pluralWord(difficultCount, ['сложный', 'сложных', 'сложных'])}` : ''}
                {' · '}
                {m.badge}
              </div>
            )}
          </Link>
        ))}
      </div>
    </Layout>
  );
}

function pluralWord(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return forms[1];
  return forms[2];
}
