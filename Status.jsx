import { useEffect, useMemo, useState } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, Timestamp, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { uploadToCloudinary } from './uploadUtils';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import StatusViewer from './StatusViewer';

const DAY_MS = 24 * 60 * 60 * 1000;

export default function Status() {
  const { currentUser, currentProfile } = useAuth();
  const toast = useToast();
  const [statuses, setStatuses] = useState([]);
  const [text, setText] = useState('');
  const [media, setMedia] = useState(null);
  const [mediaType, setMediaType] = useState(''); // 'image' | 'video'
  const [preview, setPreview] = useState('');
  const [posting, setPosting] = useState(false);
  const [viewerGroup, setViewerGroup] = useState(null); // array of statuses for one user

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
    const type = file.type.startsWith('video') ? 'video' : 'image';
    setMedia(file);
    setMediaType(type);
    setPreview(URL.createObjectURL(file));
  }

  async function handlePost(e) {
    e.preventDefault();
    if (!text.trim() && !media) return;
    setPosting(true);
    try {
      let mediaURL = '';
      if (media) {
        mediaURL = await uploadToCloudinary(media, mediaType); // 'image' | 'video' — both valid Cloudinary resource types
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
      setText(''); setMedia(null); setMediaType(''); setPreview('');
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

  if (viewerGroup) {
    return <StatusViewer group={viewerGroup} initialIndex={0} onClose={() => setViewerGroup(null)} />;
  }

  return (
    <div className="status-page">
      <form className="card" onSubmit={handlePost}>
        <div className="form-field">
          <textarea placeholder="What's on your mind?" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        {preview && (
          mediaType === 'video'
            ? <video className="composer-preview-img" src={preview} controls playsInline />
            : <img className="composer-preview-img" src={preview} alt="" />
        )}
        <label className="btn btn-ghost btn-sm">
          Add photo/video
          <input type="file" accept="image/*,video/*" hidden onChange={handleMediaPick} />
        </label>
        {media && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => { setMedia(null); setMediaType(''); setPreview(''); }}
            style={{ marginLeft: 6 }}
          >
            Remove
          </button>
        )}
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
            <div className="status-ring-item" key={author.authorId} onClick={() => setViewerGroup(group)}>
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
