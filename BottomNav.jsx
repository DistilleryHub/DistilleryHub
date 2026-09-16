import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { IconPlaySquare, IconHome, IconUsers, IconMessage, IconPhone } from './Icons';

/**
 * Fixed bottom navigation — 5 uniform tabs: Videos, Network, Feed, Chat, Calls.
 *
 * Style: "Option 5 — Micro-Bounce Animation".
 *  - Inactive: sleek grey outline icon + small light-grey label.
 *  - Tap / active: icon springs through a bounce (scale 1 -> 1.25 -> 0.95 ->
 *    1.1) via framer-motion, then settles solid electric blue with a soft
 *    blue glow; label becomes bold vibrant blue.
 *
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

  // Chat and Calls both point at /chat (which has its own Chats/Groups/Calls
  // sub-tabs) — Calls appends ?tab=calls so Chat.jsx opens straight into the
  // calls list, and is "active" only when that param is actually set.
  const isCallsActive = location.pathname.startsWith('/chat') && new URLSearchParams(location.search).get('tab') === 'calls';
  const isChatActive = location.pathname.startsWith('/chat') && !isCallsActive;
  const isFeedActive = location.pathname === '/';

  const tabs = [
    { to: '/videos', label: L.videos, Icon: IconPlaySquare, active: location.pathname.startsWith('/videos') },
    { to: '/network', label: L.network, Icon: IconUsers, active: location.pathname.startsWith('/network') },
    { to: '/', label: L.feed, Icon: IconHome, active: isFeedActive, end: true },
    { to: '/chat', label: L.chat, Icon: IconMessage, active: isChatActive },
    { to: '/chat?tab=calls', label: L.calls, Icon: IconPhone, active: isCallsActive },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-center border-t border-navy-border
                 bg-navy-card/95 backdrop-blur pb-safe"
      style={{ paddingBottom: 'max(6px, env(safe-area-inset-bottom))' }}
    >
      {tabs.map(({ to, label, Icon, active, end }) => (
        <NavLink key={to} to={to} end={end} className="flex flex-1 flex-col items-center justify-center gap-1 py-2">
          <motion.span
            className="flex items-center justify-center"
            animate={{ scale: active ? [1, 1.25, 0.95, 1.1] : 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          >
            <Icon
              className={'w-6 h-6 transition-colors duration-150 ' + (active ? 'text-brand' : 'text-slate-400')}
              style={active ? { filter: 'drop-shadow(0 0 8px rgba(59,130,246,0.55))' } : undefined}
            />
          </motion.span>
          <span
            className={
              'transition-colors duration-150 ' +
              (active ? 'text-[10.5px] font-semibold text-brand' : 'text-[10.5px] font-medium text-slate-400')
            }
          >
            {label}
          </span>
        </NavLink>
      ))}
    </nav>
  );
}
