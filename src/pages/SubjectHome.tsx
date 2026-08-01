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

export default function SubjectHome() {
  const { subject } = useParams();
  const config = getSubject(subject);

  if (!config) return <Navigate to="/" replace />;

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
      </div>
    </Layout>
  );
}
