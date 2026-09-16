import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './AuthContext';
import StatusViewer from './StatusViewer';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Horizontal story-ring tray, shown at the top of Chat.jsx — the Status
 * feature no longer has its own bottom-nav tab, this tray (plus the full
 * /status page reached via "+") is how it's reached now.
 */
export default function StatusTray() {
  const { currentUser, currentProfile } = useAuth();
  const navigate = useNavigate();
  const [statuses, setStatuses] = useState([]);
  const [viewerGroup, setViewerGroup] = useState(null);

  useEffect(() => {
    if (!currentUser) return;
    const cutoff = Timestamp.fromMillis(Date.now() - DAY_MS);
    const q = query(collection(db, 'statuses'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setStatuses(all.filter((s) => s.createdAt && s.createdAt.toMillis() > cutoff.toMillis()));
    });
    return unsub;
  }, [currentUser]);

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

  if (!currentUser) return null;

  const myGroup = groups.find((g) => g[0].authorId === currentUser.uid) || null;
  const otherGroups = groups.filter((g) => g[0].authorId !== currentUser.uid);

  return (
    <>
      <div className="status-bar chat-status-tray">
        <div
          className="status-ring-item"
          onClick={() => (myGroup ? setViewerGroup(myGroup) : navigate('/status'))}
        >
          <div className={'status-ring' + (myGroup ? '' : ' status-ring-add')}>
            <div className="avatar avatar-lg">
              {currentProfile?.photoURL ? <img src={currentProfile.photoURL} alt="" /> : (currentProfile?.name?.[0] || '?')}
            </div>
            {!myGroup && <span className="status-ring-plus">+</span>}
          </div>
          <div className="status-ring-name">Your status</div>
        </div>

        {otherGroups.map((group) => {
          const hasUnseen = group.some((s) => !s.viewedBy?.includes(currentUser.uid));
          const author = group[0];
          return (
            <div className="status-ring-item" key={author.authorId} onClick={() => setViewerGroup(group)}>
              <div className={'status-ring' + (hasUnseen ? ' unseen' : '')}>
                <div className="avatar avatar-lg">
                  {author.authorPhotoURL ? <img src={author.authorPhotoURL} alt="" /> : (author.authorName?.[0] || '?')}
                </div>
              </div>
              <div className="status-ring-name">{author.authorName}</div>
            </div>
          );
        })}
      </div>

      {viewerGroup && (
        <StatusViewer group={viewerGroup} initialIndex={0} onClose={() => setViewerGroup(null)} />
      )}
    </>
  );
}
