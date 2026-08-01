import { Suspense, lazy } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';

const Home = lazy(() => import('./pages/Home'));
const SubjectHome = lazy(() => import('./pages/SubjectHome'));
const Exam = lazy(() => import('./pages/Exam'));
const Review = lazy(() => import('./pages/Review'));
const Search = lazy(() => import('./pages/Search'));
const Topics = lazy(() => import('./pages/Topics'));
const TopicDetail = lazy(() => import('./pages/TopicDetail'));

export default function App() {
  return (
    <HashRouter>
      <Suspense fallback={<div className="route-loading">Загрузка…</div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/:subject" element={<SubjectHome />} />
          <Route path="/:subject/exam" element={<Exam />} />
          <Route path="/:subject/review" element={<Review />} />
          <Route path="/:subject/search" element={<Search />} />
          <Route path="/:subject/topics" element={<Topics />} />
          <Route path="/:subject/topics/:topicId" element={<TopicDetail />} />
        </Routes>
      </Suspense>
    </HashRouter>
  );
}
