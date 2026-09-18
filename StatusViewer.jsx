import { useEffect, useRef, useState } from 'react';
import {
  collection, query, orderBy, onSnapshot, updateDoc, setDoc, doc,
  arrayUnion, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './AuthContext';
import { IconX, IconEye } from './Icons';

const STORY_DURATION = 5000; // ms per status while viewing

function timeAgo(ts) {
  if (!ts?.toDate) return '';
  const diff = Date.now() - ts.toDate().getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

/**
 * Full-screen story viewer for one author's group of statuses.
 * group: array of status docs (oldest first) belonging to one author.
 * Used by both Status.jsx (the full Status page) and StatusTray.jsx
 * (the tray embedded at the top of Chat.jsx).
 */
export default function StatusViewer({ group, initialIndex = 0, onClose }) {
  const { currentUser, currentProfile } = useAuth();
  const [viewerIndex, setViewerIndex] = useState(initialIndex);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [viewersList, setViewersList] = useState([]);
  const timerRef = useRef(null);

  const item = group[viewerIndex];
  const isOwnStatus = item.authorId === currentUser.uid;

  async function markViewed(target) {
    // Don't record yourself as a viewer of your own status.
    if (target.authorId === currentUser.uid) return;
    if (target.viewedBy?.includes(currentUser.uid)) return;
    // Both writes attempted independently (not one blocking the other) and
    // swallowed on failure — a view-tracking hiccup should never interrupt
    // someone just watching a story.
    try {
      await updateDoc(doc(db, 'statuses', target.id), { viewedBy: arrayUnion(currentUser.uid) });
    } catch (err) {
      console.error('markViewed: viewedBy update failed', err);
    }
    try {
      // One doc per viewer (doc id = their uid) so repeat views don't duplicate,
      // and we keep name/photo + when they viewed for the owner's "seen by" list.
      await setDoc(doc(db, 'statuses', target.id, 'views', currentUser.uid), {
        viewerId: currentUser.uid,
        viewerName: currentProfile?.name || 'Member',
        viewerPhotoURL: currentProfile?.photoURL || '',
        viewedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('markViewed: views doc write failed', err);
    }
  }

  useEffect(() => {
    markViewed(item);
    setViewersOpen(false);
    setViewersList([]);

    // Only the status's own author can see who viewed it.
    let unsubViews = null;
    if (item.authorId === currentUser.uid) {
      const q = query(collection(db, 'statuses', item.id, 'views'), orderBy('viewedAt', 'desc'));
      unsubViews = onSnapshot(q, (snap) => {
        setViewersList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      });
    }

    return () => { if (unsubViews) unsubViews(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerIndex]);

  useEffect(() => {
    if (viewersOpen) {
      clearTimeout(timerRef.current);
      return;
    }
    timerRef.current = setTimeout(() => {
      if (viewerIndex < group.length - 1) {
        setViewerIndex((i) => i + 1);
      } else {
        onClose();
      }
    }, STORY_DURATION);
    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerIndex, viewersOpen]);

  function goNext() {
    if (viewersOpen) return;
    clearTimeout(timerRef.current);
    if (viewerIndex < group.length - 1) setViewerIndex((i) => i + 1);
    else onClose();
  }

  function goPrev() {
    if (viewersOpen) return;
    clearTimeout(timerRef.current);
    if (viewerIndex > 0) setViewerIndex((i) => i - 1);
  }

  return (
    <div className="status-viewer">
      <div className="status-progress-row">
        {group.map((_, i) => (
          <div key={i} className="status-progress-bar">
            <div className={'status-progress-fill' + (i < viewerIndex ? ' full' : i === viewerIndex ? ' active' : '')} />
          </div>
        ))}
      </div>
      <div className="status-viewer-header">
        <div className="avatar">
          {item.authorPhotoURL ? <img src={item.authorPhotoURL} alt="" /> : (item.authorName?.[0] || '?')}
        </div>
        <div className="status-viewer-name">{item.authorName}</div>
        <button className="btn btn-ghost btn-sm" onClick={onClose}><IconX className="w-4 h-4" /></button>
      </div>
      <div className="status-viewer-body">
        {item.mediaURL && item.mediaType === 'video' && (
          <video src={item.mediaURL} autoPlay muted playsInline className="status-media" />
        )}
        {item.mediaURL && item.mediaType === 'image' && (
          <img src={item.mediaURL} alt="" className="status-media" />
        )}
        {item.text && <div className="status-text-overlay">{item.text}</div>}
      </div>

      {!viewersOpen && (
        <div className="status-tap-zone status-tap-left" onClick={goPrev} />
      )}
      {!viewersOpen && (
        <div className="status-tap-zone status-tap-right" onClick={goNext} />
      )}

      {isOwnStatus && (
        <button
          type="button"
          className="status-viewers-toggle"
          onClick={() => setViewersOpen((v) => !v)}
        >
          <IconEye className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
          {viewersList.length} {viewersList.length === 1 ? 'view' : 'views'}
        </button>
      )}

      {isOwnStatus && viewersOpen && (
        <div className="status-viewers-panel">
          <div className="status-viewers-panel-header">
            <span>Viewed by</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setViewersOpen(false)}><IconX className="w-4 h-4" /></button>
          </div>
          {viewersList.length === 0 && (
            <div className="empty-state">No one has viewed this yet.</div>
          )}
          {viewersList.map((v) => (
            <div className="status-viewer-row" key={v.id}>
              <div className="avatar">
                {v.viewerPhotoURL ? <img src={v.viewerPhotoURL} alt="" /> : (v.viewerName?.[0] || '?')}
              </div>
              <div className="status-viewer-row-text">
                <div className="status-viewer-row-name">{v.viewerName}</div>
                <div className="status-viewer-row-time">{timeAgo(v.viewedAt)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
