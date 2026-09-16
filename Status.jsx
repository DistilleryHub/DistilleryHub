import { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection, query, orderBy, onSnapshot, addDoc, updateDoc, setDoc, doc,
  arrayUnion, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { uploadToCloudinary } from './uploadUtils';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

const DAY_MS = 24 * 60 * 60 * 1000;
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

export default function Status() {
  const { currentUser, currentProfile } = useAuth();
  const toast = useToast();
  const [statuses, setStatuses] = useState([]);
  const [text, setText] = useState('');
  const [media, setMedia] = useState(null);
  const [preview, setPreview] = useState('');
  const [posting, setPosting] = useState(false);
  const [viewerGroup, setViewerGroup] = useState(null); // array of statuses for one user
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [viewersList, setViewersList] = useState([]);
  const timerRef = useRef(null);

  useEffect(() => {
    const cutoff = Timestamp.fromMillis(Date.now() - DAY_MS);
    const q = query(collection(db, 'statuses'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setStatuses(all.filter((s) => s.createdAt && s.createdAt.toMillis() > cutoff.toMillis()));
    });
    return unsub;
  }, []);

  function handleMediaPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMedia(file);
    setPreview(URL.createObjectURL(file));
  }

  async function handlePost(e) {
    e.preventDefault();
    if (!text.trim() && !media) return;
    setPosting(true);
    try {
      let mediaURL = '';
      let mediaType = '';
      if (media) {
        mediaType = media.type.startsWith('video') ? 'video' : 'image';
        mediaURL = await uploadToCloudinary(media, mediaType);
      }
      await addDoc(collection(db, 'statuses'), {
        authorId: currentUser.uid,
        authorName: currentProfile?.name || 'Member',
        authorPhotoURL: currentProfile?.photoURL || '',
        text: text.trim(),
        mediaURL,
        mediaType,
        viewedBy: [],
        createdAt: serverTimestamp(),
      });
      setText(''); setMedia(null); setPreview('');
      toast('Status posted');
    } catch (err) {
      toast(err.message || 'Could not post status');
    }
    setPosting(false);
  }

  // Group statuses by author, own first
  const groups = useMemo(() => {
    const byAuthor = {};
    statuses.forEach((s) => {
      if (!byAuthor[s.authorId]) byAuthor[s.authorId] = [];
      byAuthor[s.authorId].push(s);
    });
    Object.values(byAuthor).forEach((arr) => arr.sort((a, b) => (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0)));
    const list = Object.values(byAuthor);
    list.sort((a, b) => {
      if (a[0].authorId === currentUser?.uid) return -1;
      if (b[0].authorId === currentUser?.uid) return 1;
      const aUnseen = a.some((s) => !s.viewedBy?.includes(currentUser?.uid));
      const bUnseen = b.some((s) => !s.viewedBy?.includes(currentUser?.uid));
      if (aUnseen === bUnseen) return 0;
      return aUnseen ? -1 : 1;
    });
    return list;
  }, [statuses, currentUser]);

  function openGroup(group) {
    setViewerGroup(group);
    setViewerIndex(0);
  }

  function closeViewer() {
    clearTimeout(timerRef.current);
    setViewerGroup(null);
    setViewersOpen(false);
    setViewersList([]);
  }

  async function markViewed(item) {
    // Don't record yourself as a viewer of your own status.
    if (item.authorId === currentUser.uid) return;
    if (item.viewedBy?.includes(currentUser.uid)) return;
    await updateDoc(doc(db, 'statuses', item.id), { viewedBy: arrayUnion(currentUser.uid) });
    // One doc per viewer (doc id = their uid) so repeat views don't duplicate,
    // and we keep name/photo + when they viewed for the owner's "seen by" list.
    await setDoc(doc(db, 'statuses', item.id, 'views', currentUser.uid), {
      viewerId: currentUser.uid,
      viewerName: currentProfile?.name || 'Member',
      viewerPhotoURL: currentProfile?.photoURL || '',
      viewedAt: serverTimestamp(),
    });
  }

  useEffect(() => {
    if (!viewerGroup) return;
    const item = viewerGroup[viewerIndex];
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
  }, [viewerGroup, viewerIndex]);

  useEffect(() => {
    if (!viewerGroup || viewersOpen) {
      clearTimeout(timerRef.current);
      return;
    }
    timerRef.current = setTimeout(() => {
      if (viewerIndex < viewerGroup.length - 1) {
        setViewerIndex((i) => i + 1);
      } else {
        closeViewer();
      }
    }, STORY_DURATION);
    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerGroup, viewerIndex, viewersOpen]);

  function goNext() {
    if (viewersOpen) return;
    clearTimeout(timerRef.current);
    if (viewerIndex < viewerGroup.length - 1) setViewerIndex((i) => i + 1);
    else closeViewer();
  }

  function goPrev() {
    if (viewersOpen) return;
    clearTimeout(timerRef.current);
    if (viewerIndex > 0) setViewerIndex((i) => i - 1);
  }

  if (viewerGroup) {
    const item = viewerGroup[viewerIndex];
    const isOwnStatus = item.authorId === currentUser.uid;
    return (
      <div className="status-viewer">
        <div className="status-progress-row">
          {viewerGroup.map((_, i) => (
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
          <button className="btn btn-ghost btn-sm" onClick={closeViewer}>✕</button>
        </div>
        <div className="status-viewer-body">
          {item.mediaURL && item.mediaType === 'video' && (
            <video src={item.mediaURL} autoPlay muted className="status-media" />
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
            👁 {viewersList.length} {viewersList.length === 1 ? 'view' : 'views'}
          </button>
        )}

        {isOwnStatus && viewersOpen && (
          <div className="status-viewers-panel">
            <div className="status-viewers-panel-header">
              <span>Viewed by</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setViewersOpen(false)}>✕</button>
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

  return (
    <div className="status-page">
      <form className="card" onSubmit={handlePost}>
        <div className="form-field">
          <textarea placeholder="What's on your mind?" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        {preview && <img className="composer-preview-img" src={preview} alt="" />}
        <label className="btn btn-ghost btn-sm">
          Add photo/video
          <input type="file" accept="image/*,video/*" hidden onChange={handleMediaPick} />
        </label>
        <button type="submit" className="btn btn-primary btn-block" disabled={posting || (!text.trim() && !media)} style={{ marginTop: 8 }}>
          {posting ? <span className="spinner" /> : 'Post status'}
        </button>
      </form>

      <div className="status-bar">
        {groups.length === 0 && <div className="empty-state">No active statuses right now.</div>}
        {groups.map((group) => {
          const hasUnseen = group.some((s) => !s.viewedBy?.includes(currentUser.uid));
          const author = group[0];
          return (
            <div className="status-ring-item" key={author.authorId} onClick={() => openGroup(group)}>
              <div className={'status-ring' + (hasUnseen ? ' unseen' : '')}>
                <div className="avatar avatar-lg">
                  {author.authorPhotoURL ? <img src={author.authorPhotoURL} alt="" /> : (author.authorName?.[0] || '?')}
                </div>
              </div>
              <div className="status-ring-name">{author.authorId === currentUser.uid ? 'You' : author.authorName}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
