import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { SUBJECTS } from '../config/subjects';
import './Home.css';

export default function Home() {
  return (
    <Layout>
      <div className="home-hero">
        <span className="eyebrow">Три дисциплины · один экзамен</span>
        <h1>Выберите предмет</h1>
        <p className="home-hero__sub">
          Тренировка вопросов, режим экзамена с таймером, поиск по базе и конспекты по темам.
        </p>
      </div>

      <div className="subject-grid">
        {SUBJECTS.map((s, i) => (
          <Link key={s.slug} to={`/${s.slug}`} className="subject-card">
            <span className="subject-card__index mono">{String(i + 1).padStart(2, '0')}</span>
            <h2 className="subject-card__name">{s.name}</h2>
            <div className="subject-card__meta">
              <span>{s.exam.questionCount} вопросов на экзамене</span>
              <span>{s.exam.minutes} мин</span>
            </div>
          </Link>
        ))}
      </div>
    </Layout>
  );
}
