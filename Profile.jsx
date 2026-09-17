import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  collection, query, where, orderBy, onSnapshot, doc, updateDoc,
  serverTimestamp, arrayUnion, arrayRemove, writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import ReportDialog from './ReportDialog';
import { followUser, unfollowUser, listenIsFollowing } from './follows';
import { uploadToCloudinary } from './uploadUtils';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { notify } from './notify';

export default function Profile() {
  const { uid } = useParams();
  const { currentUser, currentProfile } = useAuth();
  const toast = useToast();
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [connections, setConnections] = useState([]);
  const [editing, setEditing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [form, setForm] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef(null);
  const isOwn = uid === currentUser?.uid;

  useEffect(() => {
    if (!currentUser || isOwn) return;
    return listenIsFollowing(currentUser.uid, uid, setIsFollowing);
  }, [currentUser, uid, isOwn]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'users', uid), (snap) => {
      if (snap.exists()) setProfile({ id: snap.id, ...snap.data() });
    });
    return unsub;
  }, [uid]);

  useEffect(() => {
    const q = query(collection(db, 'posts'), where('authorId', '==', uid), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [uid]);

  useEffect(() => {
    if (!currentUser || isOwn) return;
    const qFrom = query(collection(db, 'connections'), where('from', '==', currentUser.uid));
    const qTo = query(collection(db, 'connections'), where('to', '==', currentUser.uid));
    let fromDocs = [], toDocs = [];
    const merge = () => setConnections([...fromDocs, ...toDocs]);
    const unsub1 = onSnapshot(qFrom, (snap) => { fromDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() })); merge(); });
    const unsub2 = onSnapshot(qTo, (snap) => { toDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() })); merge(); });
    return () => { unsub1(); unsub2(); };
  }, [currentUser, isOwn]);

  const conn = connections.find((c) => c.from === uid || c.to === uid);

  async function sendRequest() {
    // Deterministic ID (sorted pair) — see Network.jsx's sendRequest for why.
    const connId = [currentUser.uid, uid].sort().join('_');
    const connRef = doc(db, 'connections', connId);
    const batch = writeBatch(db);
    batch.set(connRef, {
      from: currentUser.uid, to: uid, status: 'pending', createdAt: serverTimestamp(),
    });
    batch.set(doc(db, 'rateLimitsConnections', currentUser.uid), {
      lastConnectionRequestAt: serverTimestamp(),
    }, { merge: true });
    try {
      await batch.commit();
    } catch (err) {
      if (err.code === 'permission-denied') {
        toast('Too many requests too fast — wait a moment and try again');
      } else {
        toast('Could not send request');
      }
      return;
    }
    notify({
      toUserId: uid,
      type: 'connection_request',
      message: `${currentProfile?.name || 'Someone'} sent you a connection request`,
      link: '/network',
      fromUserId: currentUser.uid,
      fromUserName: currentProfile?.name || 'Member',
      fromUserPhoto: currentProfile?.photoURL || '',
    });
    toast('Request sent');
  }

  async function handleFollowToggle() {
    try {
      if (isFollowing) {
        await unfollowUser(currentUser.uid, uid);
      } else {
        await followUser(currentUser.uid, uid);
        notify({
          toUserId: uid,
          type: 'follow',
          message: `${currentProfile?.name || 'Someone'} started following you`,
          link: `/profile/${currentUser.uid}`,
          fromUserId: currentUser.uid,
          fromUserName: currentProfile?.name || 'Member',
          fromUserPhoto: currentProfile?.photoURL || '',
        });
      }
    } catch (err) {
      toast(err.message || 'Could not update follow');
    }
  }

  async function toggleBlock(isCurrentlyBlocked) {
    if (!isCurrentlyBlocked && !confirm('Block this person? They won\u2019t be able to message or call you.')) return;
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        blocked: isCurrentlyBlocked ? arrayRemove(uid) : arrayUnion(uid),
      });
    } catch (err) {
      toast('Could not update block status');
    }
  }

  async function acceptRequest() {
    await updateDoc(doc(db, 'connections', conn.id), { status: 'accepted' });
  }

  function startEdit() {
    setForm({
      name: profile.name || '',
      headline: profile.headline || '',
      company: profile.company || '',
      location: profile.location || '',
      bio: profile.bio || '',
    });
    setEditing(true);
  }

  async function saveEdit(e) {
    e.preventDefault();
    await updateDoc(doc(db, 'users', uid), { ...form });
    setEditing(false);
    toast('Profile updated');
  }

  function handlePhotoPick(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again later
    if (!file || !isOwn) return;
    uploadPhoto(file);
  }

  async function uploadPhoto(file) {
    const localUrl = URL.createObjectURL(file);
    setPhotoPreview(localUrl);
    setUploadingPhoto(true);
    try {
      const secureUrl = await uploadToCloudinary(file, 'image');
      await updateDoc(doc(db, 'users', uid), { photoURL: secureUrl });
      toast('Profile photo updated');
    } catch (err) {
      toast(err.message || 'Could not update photo');
    } finally {
      setUploadingPhoto(false);
      setPhotoPreview('');
      URL.revokeObjectURL(localUrl);
    }
  }

  if (!profile) return <div className="empty-state">Loading…</div>;

  const avatarSrc = photoPreview || profile.photoURL;

  return (
    <div className="profile-page">
      <div className="card profile-header">
        <div
          className={'avatar avatar-xl profile-avatar-wrap' + (isOwn ? ' profile-avatar-editable' : '')}
          onClick={() => isOwn && !uploadingPhoto && photoInputRef.current?.click()}
          role={isOwn ? 'button' : undefined}
          aria-label={isOwn ? 'Change profile photo' : undefined}
        >
          {avatarSrc ? <img src={avatarSrc} alt="" /> : (profile.name?.[0] || '?')}

          {isOwn && (
            <span className="profile-avatar-edit-badge">
              {uploadingPhoto ? <span className="spinner" /> : '✏️'}
            </span>
          )}
        </div>
        {isOwn && (
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={handlePhotoPick}
          />
        )}

        {!editing ? (
          <>
            <h2>{profile.name}</h2>
            {profile.headline && <div className="job-meta">{profile.headline}</div>}
            {profile.company && <div className="job-meta">{profile.company}{profile.location ? ` • ${profile.location}` : ''}</div>}
            {profile.bio && <p className="job-description">{profile.bio}</p>}
            <div className="job-meta">
              <strong>{profile.followerCount || 0}</strong> followers · <strong>{profile.followingCount || 0}</strong> following
            </div>
            <div className="job-actions" style={{ marginTop: 10 }}>
              {isOwn && (
                <button className="btn btn-ghost btn-sm" onClick={startEdit}>Edit profile</button>
              )}
              {!isOwn && (
                <button
                  type="button"
                  className={'btn btn-sm' + (isFollowing ? ' btn-ghost' : ' btn-primary')}
                  onClick={handleFollowToggle}
                >
                  {isFollowing ? 'Following' : '+ Follow'}
                </button>
              )}
              {!isOwn && !conn && (
                <button className="btn btn-primary btn-sm" onClick={sendRequest}>Connect</button>
              )}
              {!isOwn && conn?.status === 'pending' && conn.to === currentUser.uid && (
                <button className="btn btn-primary btn-sm" onClick={acceptRequest}>Accept request</button>
              )}
              {!isOwn && conn?.status === 'pending' && conn.from === currentUser.uid && (
                <button className="btn btn-ghost btn-sm" disabled>Pending</button>
              )}
              {!isOwn && conn?.status === 'accepted' && (
                <Link className="btn btn-primary btn-sm" to="/chat">Message</Link>
              )}
              {!isOwn && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => toggleBlock((currentProfile?.blocked || []).includes(uid))}
                >
                  {(currentProfile?.blocked || []).includes(uid) ? '✅ Unblock' : '🚫 Block'}
                </button>
              )}
              {!isOwn && (
                <button className="btn btn-ghost btn-sm" onClick={() => setReporting(true)}>🚩 Report</button>
              )}
            </div>
          </>
        ) : (
          <form onSubmit={saveEdit}>
            <div className="form-field">
              <input type="text" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-field">
              <input type="text" placeholder="Headline" value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} />
            </div>
            <div className="form-field">
              <input type="text" placeholder="Company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </div>
            <div className="form-field">
              <input type="text" placeholder="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
            <div className="form-field">
              <textarea placeholder="Bio" rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
            </div>
            <div className="job-actions">
              <button type="submit" className="btn btn-primary btn-sm">Save</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </form>
        )}
      </div>

      <h3>Posts</h3>
      {posts.length === 0 && <div className="empty-state">No posts yet.</div>}
      {posts.map((post) => (
        <div className="card post" key={post.id}>
          {post.text && <p className="post-text">{post.text}</p>}
          {post.imageURL && <img className="post-image" src={post.imageURL} alt="" />}
        </div>
      ))}

      {reporting && (
        <ReportDialog
          targetType="user"
          targetId={uid}
          onClose={() => setReporting(false)}
          onSubmitted={() => toast('Report submitted. Thanks for flagging this.')}
        />
      )}
    </div>
  );
}
