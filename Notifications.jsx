import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, orderBy, onSnapshot, doc, updateDoc, deleteDoc, writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './AuthContext';
import { useLanguage } from './LanguageContext';
import { IconBell, IconX } from './Icons';
import { useToast } from './ToastContext';
import { useNotifications } from './src/context/NotificationContext';

function timeAgo(ts) {
  if (!ts?.toDate) return '';
  const diff = Date.now() - ts.toDate().getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Notifications() {
  const { currentUser } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const { permission: pushPermission, enabling: pushEnabling, enableNotifications } = useNotifications();

  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, 'notifications'),
      where('toUserId', '==', currentUser.uid),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setNotifications(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [currentUser]);

  async function markRead(n) {
    if (n.read) return;
    try {
      await updateDoc(doc(db, 'notifications', n.id), { read: true });
    } catch (err) {
      console.error('markRead failed', err);
    }
  }

  // Tapping a notification should mark it read AND take you to whatever it's
  // about — a pending request, a job, a group post, etc. — not just sit there.
  function openNotification(n) {
    markRead(n);
    if (n.link) navigate(n.link);
  }

  async function deleteOne(e, n) {
    e.stopPropagation();
    try {
      await deleteDoc(doc(db, 'notifications', n.id));
    } catch (err) {
      toast(t('toast.settingSaveFail') || 'Could not delete notification');
    }
  }

  async function markAllRead() {
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    try {
      const batch = writeBatch(db);
      unread.forEach((n) => batch.update(doc(db, 'notifications', n.id), { read: true }));
      await batch.commit();
    } catch (err) {
      console.error('markAllRead failed', err);
    }
  }

  async function clearAll() {
    if (notifications.length === 0) return;
    if (!confirm(t('notifications.clearAllConfirm'))) return;
    try {
      const batch = writeBatch(db);
      notifications.forEach((n) => batch.delete(doc(db, 'notifications', n.id)));
      await batch.commit();
    } catch (err) {
      console.error('clearAll failed', err);
    }
  }

  async function clearRead() {
    const read = notifications.filter((n) => n.read);
    if (read.length === 0) return;
    try {
      const batch = writeBatch(db);
      read.forEach((n) => batch.delete(doc(db, 'notifications', n.id)));
      await batch.commit();
    } catch (err) {
      console.error('clearRead failed', err);
    }
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="notifications-page">
      <div className="notifications-header">
        <h2>{t('notifications.title')}</h2>
        {unreadCount > 0 && <span className="badge">{unreadCount} {t('notifications.new')}</span>}
      </div>

      {/* Push-permission nudge: only shows if the user hasn't granted (or has
          denied) browser push permission yet. Placed here, not just in
          Settings, so people see the option right where notifications live. */}
      {pushPermission !== 'granted' && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <span style={{ fontSize: 22 }}><IconBell className="w-6 h-6" /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>
              {pushPermission === 'denied' ? 'Push notifications blocked' : 'Turn on push notifications'}
            </div>
            <div className="settings-toggle-hint">
              {pushPermission === 'denied'
                ? 'Notifications block hain browser/device settings mein — waha se manually allow karo.'
                : 'Naye likes, messages, jobs aur updates ke liye turant alert paane ke liye enable karo.'}
            </div>
          </div>
          {pushPermission !== 'denied' && (
            <button className="btn btn-primary btn-sm" onClick={enableNotifications} disabled={pushEnabling}>
              {pushEnabling ? 'Enabling…' : 'Enable'}
            </button>
          )}
        </div>
      )}

      {notifications.length > 0 && (
        <div className="notifications-toolbar">
          <button className="btn btn-ghost btn-sm" onClick={markAllRead} disabled={unreadCount === 0}>
            {t('notifications.markAllRead')}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={clearRead} disabled={notifications.every((n) => !n.read)}>
            {t('notifications.clearRead')}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={clearAll}>
            {t('notifications.clearAll')}
          </button>
        </div>
      )}

      {notifications.length === 0 && (
        <div className="empty-state">{t('notifications.empty')}</div>
      )}

      {notifications.length > 0 && (
        <div className="notifications-list">
          {notifications.map((n) => (
            <div
              className={'notification-row' + (n.read ? '' : ' unread')}
              key={n.id}
              onClick={() => openNotification(n)}
              role="button"
              tabIndex={0}
            >
              <div className="notification-avatar">
                {n.fromUserPhoto ? (
                  <img src={n.fromUserPhoto} alt="" />
                ) : (
                  (n.fromUserName || n.message || '?')[0]?.toUpperCase()
                )}
              </div>
              <div className="notification-text">
                <div className="notification-message">{n.message}</div>
                <div className="post-time">{timeAgo(n.createdAt)}</div>
              </div>
              {!n.read && <span className="notification-dot" />}
              <button
                className="btn btn-ghost btn-sm notification-delete"
                onClick={(e) => deleteOne(e, n)}
                aria-label={t('notifications.delete')}
                title={t('notifications.delete')}
              >
                <IconX className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
