import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import { useLanguage } from './LanguageContext.jsx';
import { CallProvider } from './CallContext.jsx';
import CallScreen from './CallScreen.jsx';
import MainLayout from './MainLayout.jsx';
import Feed from './Feed.jsx';
import Auth from './Auth.jsx';
import ConfirmDelete from './ConfirmDelete.jsx';
import Network from './Network.jsx';
import Jobs from './Jobs.jsx';
import Articles from './Articles.jsx';
import Status from './Status.jsx';
import Market from './Market.jsx';
import StoreDetail from './StoreDetail.jsx';
import Videos from './Videos.jsx';
import FilesPage from './FilesPage.jsx';
import Learning from './Learning.jsx';
import Notifications from './Notifications.jsx';
import Chat from './Chat.jsx';
import Admin from './Admin.jsx';
import Profile from './Profile.jsx';
import Search from './Search.jsx';
import Settings from './Settings.jsx';
import Groups from './Groups.jsx';
import GroupDetail from './GroupDetail.jsx';

function RequireAuth({ children }) {
  const { currentUser } = useAuth();
  if (!currentUser) return <Navigate to="/auth" replace />;
  return children;
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
      <Route path="/confirm-delete" element={<ConfirmDelete />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <CallProvider>
              <MainLayout>
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
                  <Route path="/store/:storeId" element={<StoreDetail />} />
                  <Route path="/videos" element={<Videos />} />
                  <Route path="/files" element={<FilesPage />} />
                  <Route path="/learning" element={<Learning />} />
                  <Route path="/notifications" element={<Notifications />} />
                  <Route path="/chat" element={<Chat />} />
                  <Route path="/admin" element={<Admin />} />
                  <Route path="/profile/:uid" element={<Profile />} />
                  <Route path="/settings" element={<Settings />} />
                </Routes>
              </MainLayout>
              <CallScreen />
            </CallProvider>
          </RequireAuth>
        }
      />
    </Routes>
  );
}
