import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import { useLanguage } from './LanguageContext.jsx';
import { CallProvider } from './CallContext.jsx';
import CallScreen from './CallScreen.jsx';
import MainLayout from './MainLayout.jsx';
import Auth from './Auth.jsx';
// Feed stays eager: it's the landing page ("/") for every signed-in user,
// so lazy-loading it would only add a loading flash on the most common
// first paint instead of saving anything.
import Feed from './Feed.jsx';

// Everything else is route-level code split: each page's JS only
// downloads when the user actually navigates there, shrinking the
// initial bundle for e.g. someone who only ever uses Feed + Chat.
const Network = lazy(() => import('./Network.jsx'));
const Jobs = lazy(() => import('./Jobs.jsx'));
const Articles = lazy(() => import('./Articles.jsx'));
const Status = lazy(() => import('./Status.jsx'));
const Market = lazy(() => import('./Market.jsx'));
const Videos = lazy(() => import('./Videos.jsx'));
const FilesPage = lazy(() => import('./FilesPage.jsx'));
const Learning = lazy(() => import('./Learning.jsx'));
const Notifications = lazy(() => import('./Notifications.jsx'));
const Chat = lazy(() => import('./Chat.jsx'));
const Admin = lazy(() => import('./Admin.jsx'));
const Profile = lazy(() => import('./Profile.jsx'));
const Search = lazy(() => import('./Search.jsx'));
const Settings = lazy(() => import('./Settings.jsx'));
const Groups = lazy(() => import('./Groups.jsx'));
const GroupDetail = lazy(() => import('./GroupDetail.jsx'));

function RequireAuth({ children }) {
  const { currentUser } = useAuth();
  if (!currentUser) return <Navigate to="/auth" replace />;
  return children;
}

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-bg text-slate-300">
      <span className="spinner" style={{ marginRight: 8 }} />
    </div>
  );
}

export default function App() {
  const { currentUser, authLoading } = useAuth();
  const { t } = useLanguage();

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy-bg text-slate-300">
        <span className="spinner" style={{ marginRight: 8 }} /> {t('app.connecting')}
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/auth"
        element={currentUser ? <Navigate to="/" replace /> : <Auth />}
      />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <CallProvider>
              <MainLayout>
                <Suspense fallback={<RouteFallback />}>
                  <Routes>
                    <Route path="/" element={<Feed />} />
                    <Route path="/search" element={<Search />} />
                    <Route path="/groups" element={<Groups />} />
                    <Route path="/groups/:groupId" element={<GroupDetail />} />
                    <Route path="/network" element={<Network />} />
                    <Route path="/jobs" element={<Jobs />} />
                    <Route path="/articles" element={<Articles />} />
                    <Route path="/status" element={<Status />} />
                    <Route path="/market" element={<Market />} />
                    <Route path="/videos" element={<Videos />} />
                    <Route path="/files" element={<FilesPage />} />
                    <Route path="/learning" element={<Learning />} />
                    <Route path="/notifications" element={<Notifications />} />
                    <Route path="/chat" element={<Chat />} />
                    <Route path="/admin" element={<Admin />} />
                    <Route path="/profile/:uid" element={<Profile />} />
                    <Route path="/settings" element={<Settings />} />
                  </Routes>
                </Suspense>
              </MainLayout>
              <CallScreen />
            </CallProvider>
          </RequireAuth>
        }
      />
    </Routes>
  );
}
