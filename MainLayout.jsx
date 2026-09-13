import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './AuthContext';
import { useLanguage } from './LanguageContext';
import TopBar from './TopBar';
import BottomNav from './BottomNav';

// Everything that isn't one of the 6 fixed bottom-nav tabs lives behind "Menu".
// (Videos now has its own bottom-nav tab, so it's removed from this list.)
const MENU_ITEMS = [
  { to: '/groups', icon: '🧑‍🤝‍🧑', key: 'nav.groups' },
  { to: '/jobs', icon: '💼', key: 'nav.jobs' },
  { to: '/articles', icon: '📰', key: 'nav.articles' },
  { to: '/market', icon: '🛒', key: 'nav.market' },
  { to: '/files', icon: '📁', key: 'nav.files' },
  { to: '/learning', icon: '🎓', key: 'nav.learning' },
  { to: '/settings', icon: '⚙️', key: 'nav.settings' },
];

export default function MainLayout({ children }) {
  const { currentUser, currentProfile, logout } = useAuth();
  const { t } = useLanguage();
  const [showMenu, setShowMenu] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, 'notifications'),
      where('toUserId', '==', currentUser.uid),
      where('read', '==', false)
    );
    const unsub = onSnapshot(q, (snap) => setUnreadCount(snap.size));
    return unsub;
  }, [currentUser]);

  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  return (
    <div className="min-h-screen bg-navy-bg text-slate-100">
      {isOffline && (
        <div className="sticky top-0 z-[60] bg-amber-500 px-3 py-1.5 text-center text-[12.5px] font-semibold text-black">
          ⚠️ No internet connection — some actions won't work until you're back online
        </div>
      )}
      <TopBar profile={currentProfile} unreadNotifications={unreadCount} onMenuClick={() => setShowMenu(true)} />

      <main className="mx-auto w-full max-w-2xl px-3 pb-24 pt-3 sm:px-4">
        {children}
      </main>

      <BottomNav />

      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60"
            onClick={() => setShowMenu(false)}
          />
          <div
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-2xl rounded-t-2xl border-t
                       border-slate-800 bg-navy-card pb-safe"
            style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
          >
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-700" />
            <div className="grid grid-cols-4 gap-4 p-5">
              {MENU_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setShowMenu(false)}
                  className="flex flex-col items-center gap-1.5 text-center text-[11.5px] text-slate-300"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-navy-cardAlt text-xl">
                    {item.icon}
                  </span>
                  {t(item.key)}
                </NavLink>
              ))}
              {currentProfile?.isAdmin && (
                <NavLink
                  to="/admin"
                  onClick={() => setShowMenu(false)}
                  className="flex flex-col items-center gap-1.5 text-center text-[11.5px] text-slate-300"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-navy-cardAlt text-xl">
                    🛡️
                  </span>
                  {t('nav.admin')}
                </NavLink>
              )}
            </div>
            <button
              type="button"
              className="mx-5 mb-2 block w-[calc(100%-2.5rem)] rounded-lg border border-slate-700
                         py-2.5 text-[13.5px] font-medium text-slate-300"
              onClick={() => { setShowMenu(false); logout(); }}
            >
              {t('nav.signOut')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
