import { Link, Navigate, useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { useTopics } from '../hooks/useTopics';
import { getSubject } from '../config/subjects';
import './Topics.css';

export default function Topics() {
  const { subject } = useParams();
  const config = getSubject(subject);
  const { topics, loading, error } = useTopics(config?.slug, config?.topicsSourceFile);

  if (!config) return <Navigate to="/" replace />;

  return (
    <Layout crumbs={[{ label: config.shortName, to: `/${config.slug}` }, { label: 'Темы' }]}>
      <div className="topics-head">
        <span className="eyebrow">{config.name}</span>
        <h1>Конспекты по темам</h1>
        {!loading && !error && <p className="topics-head__sub mono">{topics.length} тем</p>}
      </div>

      {loading && <p className="hint">Загружаем темы…</p>}
      {error && <p className="hint hint--error">Ошибка загрузки: {error}</p>}

      <ol className="topics-list">
        {topics.map((t) => (
          <li key={t.id}>
            <Link to={`/${config.slug}/topics/${t.id}`} className="topic-row">
              <span className="topic-row__num mono">{t.number || t.id}</span>
              <span className="topic-row__title">{t.title}</span>
            </Link>
          </li>
        ))}
      </ol>
    </Layout>
  );
}
