import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  collection, query, orderBy, onSnapshot, addDoc, deleteDoc, doc,
  updateDoc, arrayUnion, arrayRemove, serverTimestamp, increment, setDoc, getDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { uploadToCloudinary } from './uploadUtils';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { notify } from './notify';
import { useCall } from './CallContext';

function timeAgo(ts) {
  if (!ts?.toDate) return '';
  const diff = Date.now() - ts.toDate().getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function GroupComments({ groupId, postId, postAuthorId, currentUser, currentProfile }) {
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');

  useEffect(() => {
    const q = query(
      collection(db, 'groups', groupId, 'posts', postId, 'comments'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [groupId, postId]);

  async function addComment(e) {
    e.preventDefault();
    if (!text.trim()) return;
    await addDoc(collection(db, 'groups', groupId, 'posts', postId, 'comments'), {
      authorId: currentUser.uid,
      authorName: currentProfile?.name || 'Member',
      text: text.trim(),
      createdAt: serverTimestamp(),
    });
    notify({
      toUserId: postAuthorId,
      type: 'comment',
      message: `${currentProfile?.name || 'Someone'} commented on your group post`,
      link: `/groups/${groupId}`,
      fromUserId: currentUser.uid,
      fromUserName: currentProfile?.name || 'Member',
      fromUserPhoto: currentProfile?.photoURL || '',
    });
    setText('');
  }

  return (
    <div className="comments-section">
      {comments.map((c) => (
        <div className="comment-row" key={c.id}>
          <span className="comment-author">{c.authorName}</span> {c.text}
        </div>
      ))}
      <form className="chat-input-row" onSubmit={addComment}>
        <input type="text" placeholder="Write a comment..." value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="btn btn-primary btn-sm">Send</button>
      </form>
    </div>
  );
}

export default function GroupDetail() {
  const { groupId } = useParams();
  const { currentUser, currentProfile } = useAuth();
  const toast = useToast();
  const { startCall } = useCall();
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [isMember, setIsMember] = useState(false);
  const [posts, setPosts] = useState([]);
  const [text, setText] = useState('');
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState('');
  const [posting, setPosting] = useState(false);
  const [openComments, setOpenComments] = useState(null);
  const [showMembers, setShowMembers] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'groups', groupId), (snap) => {
      if (snap.exists()) setGroup({ id: snap.id, ...snap.data() });
    });
    return unsub;
  }, [groupId]);

  useEffect(() => {
    const q = query(collection(db, 'groups', groupId, 'members'), orderBy('joinedAt', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setMembers(list);
      setIsMember(list.some((m) => m.id === currentUser.uid));
    });
    return unsub;
  }, [groupId, currentUser.uid]);

  useEffect(() => {
    const q = query(collection(db, 'groups', groupId, 'posts'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [groupId]);

  async function joinGroup() {
    await setDoc(doc(db, 'groups', groupId, 'members', currentUser.uid), {
      uid: currentUser.uid,
      name: currentProfile?.name || 'Member',
      photoURL: currentProfile?.photoURL || '',
      role: 'member',
      joinedAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'groups', groupId), { memberCount: increment(1) });
    const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
    const existing = userSnap.data()?.groupIds || [];
    await updateDoc(doc(db, 'users', currentUser.uid), { groupIds: [...new Set([...existing, groupId])] });
    if (group?.createdBy) {
      notify({
        toUserId: group.createdBy,
        type: 'group_add',
        message: `${currentProfile?.name || 'Someone'} joined your group "${group.name}"`,
        link: `/groups/${groupId}`,
        fromUserId: currentUser.uid,
        fromUserName: currentProfile?.name || 'Member',
        fromUserPhoto: currentProfile?.photoURL || '',
      });
    }
    toast('Joined group');
  }

  async function leaveGroup() {
    await deleteDoc(doc(db, 'groups', groupId, 'members', currentUser.uid));
    await updateDoc(doc(db, 'groups', groupId), { memberCount: increment(-1) });
    await updateDoc(doc(db, 'users', currentUser.uid), { groupIds: arrayRemove(groupId) });
    toast('Left group');
  }

  function handleImagePick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImage(file);
    setPreview(URL.createObjectURL(file));
  }

  async function handlePost(e) {
    e.preventDefault();
    if (!text.trim() && !image) return;
    setPosting(true);
    try {
      let imageURL = '';
      if (image) {
        imageURL = await uploadToCloudinary(image, 'image');
      }
      await addDoc(collection(db, 'groups', groupId, 'posts'), {
        authorId: currentUser.uid,
        authorName: currentProfile?.name || 'Member',
        authorPhotoURL: currentProfile?.photoURL || '',
        text: text.trim(),
        imageURL,
        likes: [],
        createdAt: serverTimestamp(),
      });
      setText(''); setImage(null); setPreview('');
    } catch (err) {
      toast(err.message || 'Could not post');
    }
    setPosting(false);
  }

  async function toggleLike(post) {
    const liked = post.likes?.includes(currentUser.uid);
    await updateDoc(doc(db, 'groups', groupId, 'posts', post.id), {
      likes: liked ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid),
    });
    if (!liked) {
      notify({
        toUserId: post.authorId,
        type: 'like',
        message: `${currentProfile?.name || 'Someone'} liked your group post`,
        link: `/groups/${groupId}`,
        fromUserId: currentUser.uid,
        fromUserName: currentProfile?.name || 'Member',
        fromUserPhoto: currentProfile?.photoURL || '',
      });
    }
  }

  // Group calls reuse the same mesh WebRTC CallContext as 1-to-1 calls —
  // it already accepts an array of participant UIDs.
  async function startGroupCall(callType) {
    const others = members.filter((m) => m.uid !== currentUser.uid).map((m) => m.uid);
    if (others.length === 0) {
      toast('No other members to call yet');
      return;
    }
    if (others.length > 7) {
      toast('Group calls work best with up to 8 people — starting anyway');
    }
    try {
      await startCall(others, callType);
      others.forEach((uid) => {
        notify({
          toUserId: uid,
          type: 'group_call',
          message: `${currentProfile?.name || 'Someone'} started a call in "${group.name}"`,
          link: `/groups/${groupId}`,
          fromUserId: currentUser.uid,
          fromUserName: currentProfile?.name || 'Member',
          fromUserPhoto: currentProfile?.photoURL || '',
          groupName: group.name,
        });
      });
    } catch (err) {
      toast(err.message || 'Could not start call');
    }
  }

  if (!group) return <div className="empty-state">Loading…</div>;

  return (
    <div className="group-detail-page">
      <div className="card group-banner">
        {group.coverPhotoURL ? (
          <img className="group-banner-cover" src={group.coverPhotoURL} alt="" />
        ) : (
          <div className="group-banner-cover group-card-cover-placeholder">🥃</div>
        )}
        <h1>{group.name}</h1>
        <div className="job-meta">{group.category} • {group.memberCount || 0} members</div>
        {group.description && <p className="job-description">{group.description}</p>}
        <div className="job-actions">
          {isMember ? (
            <button className="btn btn-ghost btn-sm" onClick={leaveGroup}>Leave group</button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={joinGroup}>Join group</button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setShowMembers((v) => !v)}>
            {showMembers ? 'Hide members' : 'View members'}
          </button>
          {isMember && members.length > 1 && (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => startGroupCall('audio')}>🎤 Voice call</button>
              <button className="btn btn-ghost btn-sm" onClick={() => startGroupCall('video')}>📹 Video call</button>
            </>
          )}
        </div>
        {showMembers && (
          <div className="group-members-list">
            {members.map((m) => (
              <Link to={`/profile/${m.uid}`} className="group-member-row" key={m.id}>
                <div className="avatar">
                  {m.photoURL ? <img src={m.photoURL} alt="" /> : (m.name?.[0] || '?')}
                </div>
                <span>{m.name}{m.role === 'admin' ? ' • Admin' : ''}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {isMember ? (
        <form className="card composer" onSubmit={handlePost}>
          <div className="composer-top">
            <div className="avatar">
              {currentProfile?.photoURL ? <img src={currentProfile.photoURL} alt="" /> : (currentProfile?.name?.[0] || 'M')}
            </div>
            <textarea
              placeholder={`Post something in ${group.name}...`}
              value={text} onChange={(e) => setText(e.target.value)} rows={3}
            />
          </div>
          {preview && (
            <div className="composer-preview">
              <img src={preview} alt="preview" />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setImage(null); setPreview(''); }}>
                Remove
              </button>
            </div>
          )}
          <div className="composer-actions">
            <label className="btn btn-ghost btn-sm">
              Add photo
              <input type="file" accept="image/*" hidden onChange={handleImagePick} />
            </label>
            <button type="submit" className="btn btn-primary btn-sm" disabled={posting || (!text.trim() && !image)}>
              {posting ? <span className="spinner" /> : 'Post'}
            </button>
          </div>
        </form>
      ) : (
        <div className="empty-state">Join this group to post and comment.</div>
      )}

      {posts.length === 0 && <div className="empty-state">No posts in this group yet.</div>}

      {posts.map((post) => (
        <div className="card post" key={post.id}>
          <div className="post-header">
            <Link to={`/profile/${post.authorId}`} className="avatar">
              {post.authorPhotoURL ? <img src={post.authorPhotoURL} alt="" /> : (post.authorName?.[0] || '?')}
            </Link>
            <div className="post-author">
              <Link to={`/profile/${post.authorId}`} className="post-author-name">{post.authorName}</Link>
              <div className="post-time">{timeAgo(post.createdAt)}</div>
            </div>
          </div>
          {post.text && <p className="post-text">{post.text}</p>}
          {post.imageURL && <img className="post-image" src={post.imageURL} alt="" />}
          <div className="post-actions">
            <button
              type="button"
              className={'btn btn-ghost btn-sm' + (post.likes?.includes(currentUser.uid) ? ' active' : '')}
              onClick={() => toggleLike(post)}
            >
              👍 {post.likes?.length || 0}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setOpenComments(openComments === post.id ? null : post.id)}
            >
              💬 Comments
            </button>
          </div>
          {openComments === post.id && (
            <GroupComments groupId={groupId} postId={post.id} postAuthorId={post.authorId} currentUser={currentUser} currentProfile={currentProfile} />
          )}
        </div>
      ))}
    </div>
  );
}

