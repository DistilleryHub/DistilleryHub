import { NavLink, useLocation } from 'react-router-dom';
import { IconPlaySquare, IconHome, IconUsers, IconMessage, IconPhone } from './Icons';

/**
 * Fixed bottom navigation — 5 tabs, Feed centered (primary/highlighted):
 * Videos, Network, Feed, Chat, Calls.
 * (Status no longer has its own tab — it now lives as a tray at the top of
 * the Chat screen, like an Instagram DM inbox. Calls deep-links into Chat's
 * existing "calls" sub-tab via ?tab=calls.
 * Menu lives in the TopBar's top-right icon; notifications bell is also in
 * the TopBar only.)
 */
export default function BottomNav({ labels = {} }) {
  const location = useLocation();
  const L = {
    videos: 'Videos',
    network: 'Network',
    feed: 'Feed',
    chat: 'Chat',
    calls: 'Calls',
    ...labels,
  };

  const tabBase =
    'flex flex-1 flex-col items-center justify-center gap-1 py-1.5 text-[10.5px] font-medium ' +
    'text-slate-400 transition active:scale-90 active:opacity-70';
  const tabActive = 'text-brand';

  // Chat and Calls both point at /chat (which has its own Chats/Groups/Calls
  // sub-tabs) — Calls appends ?tab=calls so Chat.jsx opens straight into the
  // calls list, and is "active" only when that param is actually set.
  const isCallsActive = location.pathname.startsWith('/chat') && new URLSearchParams(location.search).get('tab') === 'calls';
  const isChatActive = location.pathname.startsWith('/chat') && !isCallsActive;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-center border-t border-slate-800
                 bg-navy-card/95 backdrop-blur pb-safe"
      style={{ paddingBottom: 'max(6px, env(safe-area-inset-bottom))' }}
    >
      <NavLink to="/videos" className={({ isActive }) => tabBase + (isActive ? ' ' + tabActive : '')}>
        <IconPlaySquare className="w-6 h-6" />
        {L.videos}
      </NavLink>

      <NavLink to="/network" className={({ isActive }) => tabBase + (isActive ? ' ' + tabActive : '')}>
        <IconUsers className="w-6 h-6" />
        {L.network}
      </NavLink>

      <NavLink to="/" end className={({ isActive }) => 'flex flex-1 flex-col items-center justify-center gap-1 py-1.5 text-[10.5px] font-medium text-slate-400 transition active:scale-90 active:opacity-70'}>
        {({ isActive }) => (
          <>
            <span
              className={
                'flex items-center justify-center w-14 h-14 rounded-full -mt-6 border-4 border-white shadow-lg transition ' +
                (isActive ? 'bg-brand text-white' : 'bg-brand text-white')
              }
            >
              <IconHome className="w-6 h-6" />
            </span>
            <span className={isActive ? 'text-brand' : 'text-slate-400'}>{L.feed}</span>
          </>
        )}
      </NavLink>

      <NavLink to="/chat" className={tabBase + (isChatActive ? ' ' + tabActive : '')}>
        <IconMessage className="w-6 h-6" />
        {L.chat}
      </NavLink>

      <NavLink to="/chat?tab=calls" className={tabBase + (isCallsActive ? ' ' + tabActive : '')}>
        <IconPhone className="w-6 h-6" />
        {L.calls}
      </NavLink>
    </nav>
  );
}
