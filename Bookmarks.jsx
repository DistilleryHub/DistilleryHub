import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { listenBookmarks, toggleBookmark } from './bookmarks';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'post', label: 'Posts' },
  { id: 'video', label: 'Videos' },
  { id: 'job', label: 'Jobs' },
  { id: 'article', label: 'Articles' },
];

export default function Bookmarks() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [tab, setTab] = useState('all');

  useEffect(() => {
    if (!currentUser) return;
    return listenBookmarks(currentUser.uid, setItems);
  }, [currentUser]);

  async function unsave(e, item) {
    e.stopPropagation();
    await toggleBookmark(currentUser.uid, true, item);
  }

  const visible = tab === 'all' ? items : items.filter((i) => i.type === tab);

  return (
    <div className="notifications-page">
      <div className="notifications-header">
        <h2>Saved</h2>
      </div>

      <div className="notifications-toolbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={'btn btn-sm ' + (tab === t.id ? 'btn-primary' : 'btn-ghost')}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {visible.length === 0 && <div className="empty-state">Nothing saved yet.</div>}

      {visible.length > 0 && (
        <div className="notifications-list">
          {visible.map((item) => (
            <div
              className="notification-row"
              key={item.id}
              onClick={() => navigate(item.link || '/')}
              role="button"
              tabIndex={0}
            >
              <div className="notification-avatar">
                {item.imageURL ? <img src={item.imageURL} alt="" /> : (item.title || '?')[0]?.toUpperCase()}
              </div>
              <div className="notification-text">
                <div className="notification-message">{item.title}</div>
                <div className="post-time">{item.snippet}</div>
              </div>
              <button
                className="btn btn-ghost btn-sm notification-delete"
                onClick={(e) => unsave(e, item)}
                aria-label="Remove"
                title="Remove"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
