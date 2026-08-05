import { useState, useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { useTopics } from '../hooks/useTopics';
import { getSubject } from '../config/subjects';
import './TopicDetail.css';

export default function TopicDetail() {
  const { subject, topicId } = useParams();
  const config = getSubject(subject);
  const { topics, loading, error } = useTopics(config?.slug, config?.topicsSourceFile);
  const [expanded, setExpanded] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 80);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('topbar-hidden', scrolled);
    return () => document.body.classList.remove('topbar-hidden');
  }, [scrolled]);

  if (!config) return <Navigate to="/" replace />;

  const topic = topics.find((t) => String(t.id) === topicId);
  const index = topics.findIndex((t) => String(t.id) === topicId);
  const prev = index > 0 ? topics[index - 1] : undefined;
  const next = index >= 0 && index < topics.length - 1 ? topics[index + 1] : undefined;

  return (
    <Layout
      crumbs={[
        { label: config.shortName, to: `/${config.slug}` },
        { label: 'Темы', to: `/${config.slug}/topics` },
        { label: topic ? topic.title : '…' },
      ]}
    >
      {loading && <p className="hint">Загружаем тему…</p>}
      {error && <p className="hint hint--error">Ошибка загрузки: {error}</p>}

      {!loading && !error && !topic && <p className="hint">Тема не найдена.</p>}

      {topic && (
        <>
          <div className="topic-detail__head">
            <span className="eyebrow mono">Тема {topic.number || topic.id}</span>
            <h1>{topic.title}</h1>
          </div>

          <div className="topic-detail__body">
            <MarkdownRenderer content={(expanded ? topic.contentFull : topic.contentMain) || 'Материал отсутствует.'} />
          </div>

          {topic.contentFull && (
            <button className="btn btn--ghost topic-detail__toggle" onClick={() => setExpanded((v) => !v)}>
              {expanded ? 'Показать кратко' : 'Показать полностью'}
            </button>
          )}

          <div className="topic-detail__nav">
            {prev ? (
              <Link className="topic-nav-link" to={`/${config.slug}/topics/${prev.id}`}>
                ← {prev.title}
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link className="topic-nav-link topic-nav-link--next" to={`/${config.slug}/topics/${next.id}`}>
                {next.title} →
              </Link>
            )}
          </div>
        </>
      )}
    </Layout>
  );
}
