import { Suspense, lazy } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthContextProvider } from './contexts/AuthContext';
import { useAuth } from './hooks/useAuth';

const Home = lazy(() => import('./pages/Home'));
const SubjectHome = lazy(() => import('./pages/SubjectHome'));
const Exam = lazy(() => import('./pages/Exam'));
const Review = lazy(() => import('./pages/Review'));
const Search = lazy(() => import('./pages/Search'));
const Topics = lazy(() => import('./pages/Topics'));
const TopicDetail = lazy(() => import('./pages/TopicDetail'));
const Login = lazy(() => import('./pages/Login'));

/** Обёртка protected-маршрутов: пока идёт загрузка или пользователь не вошёл — показываем страницу входа */
function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="route-loading">Загрузка…</div>;
  if (!user) return <Navigate to="/login" replace />;

  return <>{children}</>;
}

export default function App() {
  return (
    <HashRouter>
      <AuthContextProvider>
        <Suspense fallback={<div className="route-loading">Загрузка…</div>}>
          <Routes>
            {/* Protected routes */}
            <Route path="/" element={<Protected><Home /></Protected>} />
            <Route path="/:subject" element={<Protected><SubjectHome /></Protected>} />
            <Route path="/:subject/exam" element={<Protected><Exam /></Protected>} />
            <Route path="/:subject/review" element={<Protected><Review /></Protected>} />
            <Route path="/:subject/search" element={<Protected><Search /></Protected>} />
            <Route path="/:subject/topics" element={<Protected><Topics /></Protected>} />
            <Route path="/:subject/topics/:topicId" element={<Protected><TopicDetail /></Protected>} />

            {/* Public routes */}
            <Route path="/login" element={<Login />} />
          </Routes>
        </Suspense>
      </AuthContextProvider>
    </HashRouter>
  );
}
