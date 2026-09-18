import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { IconSearch, IconMessage, IconBell, IconMaximize, IconMinimize, IconMenu, IconBookmark } from './Icons';

export default function TopBar({ profile, unreadNotifications = 0, onMenuClick }) {
  const { currentUser } = useAuth();
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }

  return (
    <header
      className="sticky top-0 z-40 flex items-center justify-between gap-3
                 border-b border-slate-800 bg-navy-card/95 px-4 backdrop-blur pt-safe"
      style={{ paddingTop: 'max(10px, env(safe-area-inset-top))', paddingBottom: '10px' }}
    >
      <Link to={`/profile/${currentUser?.uid || ''}`} className="flex items-center gap-2 shrink-0">
        {profile?.photoURL ? (
          <img src={profile.photoURL} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white text-xs font-semibold">
            {(profile?.name || '?')[0]?.toUpperCase()}
          </span>
        )}
      </Link>

      <div className="flex items-center gap-1.5">
        <Link
          to="/search"
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-300
                     hover:bg-navy-cardAlt transition"
          aria-label="Search"
        >
          <IconSearch className="w-5 h-5" />
        </Link>

        <Link
          to="/chat"
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-300
                     hover:bg-navy-cardAlt transition"
          aria-label="Messages"
        >
          <IconMessage className="w-5 h-5" />
        </Link>

        <Link
          to="/notifications"
          className="relative flex h-9 w-9 items-center justify-center rounded-full text-slate-300
                     hover:bg-navy-cardAlt transition"
          aria-label="Notifications"
        >
          <IconBell className="w-5 h-5" />
          {unreadNotifications > 0 && (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
          )}
        </Link>

        <Link
          to="/bookmarks"
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-300
                     hover:bg-navy-cardAlt transition text-[18px]"
          aria-label="Saved"
        >
          <IconBookmark className="w-5 h-5" />
        </Link>

        {/* Fullscreen toggle — desktop only, hidden on touch/mobile */}
        <button
          type="button"
          onClick={toggleFullscreen}
          className="hidden md:flex h-9 w-9 items-center justify-center rounded-full text-slate-300
                     hover:bg-navy-cardAlt transition"
          aria-label="Toggle fullscreen"
          title="Toggle fullscreen"
        >
          {isFullscreen ? <IconMinimize className="w-5 h-5" /> : <IconMaximize className="w-5 h-5" />}
        </button>

        <button
          type="button"
          onClick={onMenuClick}
          className="ml-1 flex h-9 w-9 items-center justify-center rounded-full text-slate-100
                     hover:bg-navy-cardAlt transition"
          aria-label="Menu"
        >
          <IconMenu className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
