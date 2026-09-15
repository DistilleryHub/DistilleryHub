import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  collection, query, orderBy, onSnapshot, addDoc, deleteDoc, doc,
  updateDoc, arrayUnion, arrayRemove, serverTimestamp, where, Timestamp,
} from 'firebase/firestore';
import { db, CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from './firebase';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { notify } from './notify';
import { bookmarkDocId, toggleBookmark, listenBookmarks } from './bookmarks';
import ShareSheet from './ShareSheet';

function timeAgo(ts) {
  if (!ts?.toDate) return '';
  const diff = Date.now() - ts.toDate().getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return ts.toDate().toLocaleDateString();
}

function Comments({ postId, postAuthorId, currentUser, currentProfile }) {
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'posts', postId, 'comments'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [postId]);

  async function addComment(e) {
    e.preventDefault();
    if (!text.trim()) return;
    await addDoc(collection(db, 'posts', postId, 'comments'), {
      authorId: currentUser.uid,
      authorName: currentProfile?.name || 'Member',
      text: text.trim(),
      createdAt: serverTimestamp(),
    });
    notify({
      toUserId: postAuthorId,
      type: 'comment',
      message: `${currentProfile?.name || 'Someone'} commented on your post`,
      link: '/',
      fromUserId: currentUser.uid,
      fromUserName: currentProfile?.name || 'Member',
      fromUserPhoto: currentProfile?.photoURL || '',
    });
    setText('');
  }

  async function removeComment(c) {
    if (c.authorId !== currentUser.uid) return;
    await deleteDoc(doc(db, 'posts', postId, 'comments', c.id));
  }

  return (
    <div className="comments-section">
      {comments.map((c) => (
        <div className="comment-row" key={c.id}>
          <span className="comment-author">{c.authorName}</span> {c.text}
          {c.authorId === currentUser.uid && (
            <button className="btn btn-ghost btn-sm" onClick={() => removeComment(c)}>✕</button>
          )}
        </div>
      ))}
      <form className="chat-input-row" onSubmit={addComment}>
        <input type="text" placeholder="Write a comment..." value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="btn btn-primary btn-sm">Send</button>
      </form>
    </div>
  );
}

export default function Feed() {
  const { currentUser, currentProfile } = useAuth();
  const toast = useToast();
  const [posts, setPosts] = useState([]);
  const [text, setText] = useState('');
  const [media, setMedia] = useState(null);
  const [mediaType, setMediaType] = useState(''); // 'image' | 'video'
  const [preview, setPreview] = useState('');
  const [posting, setPosting] = useState(false);
  const [openComments, setOpenComments] = useState(null);
  const [bookmarkIds, setBookmarkIds] = useState(new Set());
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleWhen, setScheduleWhen] = useState('');
  const [myScheduledPosts, setMyScheduledPosts] = useState([]);
  const [shareItem, setShareItem] = useState(null);

  useEffect(() => {
    if (!currentUser) return;
    return listenBookmarks(currentUser.uid, (list) => setBookmarkIds(new Set(list.map((b) => b.id))));
  }, [currentUser]);

  useEffect(() => {
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // This user's own pending scheduled posts, across devices.
  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, 'scheduledPosts'),
      where('authorId', '==', currentUser.uid),
      where('sent', '==', false)
    );
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      items.sort((a, b) => (a.scheduledFor?.toMillis() || 0) - (b.scheduledFor?.toMillis() || 0));
      setMyScheduledPosts(items);
    });
    return unsub;
  }, [currentUser]);

  // Poll for due scheduled posts while the app is open, same limitation as
  // Chat.jsx's scheduled messages: no backend cron here, so a post only
  // publishes itself while some tab of the author's is open at the time.
  useEffect(() => {
    if (!currentUser) return;
    async function checkDue() {
      const now = Date.now();
      const due = myScheduledPosts.filter((p) => (p.scheduledFor?.toMillis() || 0) <= now);
      for (const p of due) {
        try {
          await addDoc(collection(db, 'posts'), {
            authorId: p.authorId,
            authorName: p.authorName,
            authorHeadline: p.authorHeadline,
            authorPhotoURL: p.authorPhotoURL,
            text: p.text,
            imageURL: p.imageURL,
            videoURL: p.videoURL,
            likes: [],
            shares: [],
            createdAt: serverTimestamp(),
          });
          await updateDoc(doc(db, 'scheduledPosts', p.id), { sent: true, sentAt: serverTimestamp() });
        } catch (err) {
          console.error('Failed to publish scheduled post', err);
        }
      }
    }
    checkDue();
    const interval = setInterval(checkDue, 20000);
    return () => clearInterval(interval);
  }, [myScheduledPosts, currentUser]);

  function handleMediaPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const type = file.type.startsWith('video') ? 'video' : 'image';
    // Cloudinary free/unsigned uploads cap video around 100MB — warn early
    if (type === 'video' && file.size > 100 * 1024 * 1024) {
      toast('Video too large (max ~100MB)');
      e.target.value = '';
      return;
    }
    setMedia(file);
    setMediaType(type);
    setPreview(URL.createObjectURL(file));
  }

  async function uploadMedia(file, type) {
    const form = new FormData();
    form.append('file', file);
    form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    // Cloudinary needs the correct resource type endpoint for video uploads
    const resourceType = type === 'video' ? 'video' : 'image';
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
      { method: 'POST', body: form }
    );
    const data = await res.json();
    if (!data.secure_url) {
      // Surface Cloudinary's actual error instead of a generic message
      console.error('Cloudinary upload error:', data);
      throw new Error(data?.error?.message || 'Media upload failed');
    }
    return data.secure_url;
  }

  async function handleSchedule(e) {
    e.preventDefault();
    if ((!text.trim() && !media) || !scheduleWhen) return;
    const when = new Date(scheduleWhen);
    if (when.getTime() <= Date.now()) {
      toast('Pick a time in the future');
      return;
    }
    setPosting(true);
    try {
      let mediaURL = '';
      if (media) mediaURL = await uploadMedia(media, mediaType);
      await addDoc(collection(db, 'scheduledPosts'), {
        authorId: currentUser.uid,
        authorName: currentProfile?.name || 'Member',
        authorHeadline: currentProfile?.headline || '',
        authorPhotoURL: currentProfile?.photoURL || '',
        text: text.trim(),
        imageURL: mediaType === 'image' ? mediaURL : '',
        videoURL: mediaType === 'video' ? mediaURL : '',
        scheduledFor: Timestamp.fromDate(when),
        sent: false,
        createdAt: serverTimestamp(),
      });
      setText(''); setMedia(null); setMediaType(''); setPreview('');
      setShowSchedule(false); setScheduleWhen('');
      toast('Post scheduled');
    } catch (err) {
      toast(err.message || 'Could not schedule post');
    }
    setPosting(false);
  }

  async function cancelScheduledPost(id) {
    if (!confirm('Cancel this scheduled post?')) return;
    await deleteDoc(doc(db, 'scheduledPosts', id));
  }

  async function handlePost(e) {
    e.preventDefault();
    if (!text.trim() && !media) return;
    setPosting(true);
    try {
      let mediaURL = '';
      if (media) {
        mediaURL = await uploadMedia(media, mediaType);
      }
      const postRef = await addDoc(collection(db, 'posts'), {
        authorId: currentUser.uid,
        authorName: currentProfile?.name || 'Member',
        authorHeadline: currentProfile?.headline || '',
        authorPhotoURL: currentProfile?.photoURL || '',
        text: text.trim(),
        imageURL: mediaType === 'image' ? mediaURL : '',
        videoURL: mediaType === 'video' ? mediaURL : '',
        likes: [],
        shares: [],
        createdAt: serverTimestamp(),
      });
      // A video shared from the feed should also show up on the Videos page.
      if (mediaType === 'video' && mediaURL) {
        try {
          await addDoc(collection(db, 'videos'), {
            title: text.trim() ? text.trim().slice(0, 80) : 'Video',
            videoURL: mediaURL,
            description: text.trim(),
            authorId: currentUser.uid,
            authorName: currentProfile?.name || 'Member',
            sourcePostId: postRef.id,
            createdAt: serverTimestamp(),
          });
        } catch (mirrorErr) {
          // Post itself already succeeded — don't fail the whole action over this.
          console.error('Could not mirror video to Videos page', mirrorErr);
        }
      }
      setText(''); setMedia(null); setMediaType(''); setPreview('');
      toast('Posted');
    } catch (err) {
      toast(err.message || 'Could not post');
    }
    setPosting(false);
  }

  async function toggleLike(post) {
    const liked = post.likes?.includes(currentUser.uid);
    try {
      await updateDoc(doc(db, 'posts', post.id), {
        likes: liked ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid),
      });
      if (!liked) {
        notify({
          toUserId: post.authorId,
          type: 'like',
          message: `${currentProfile?.name || 'Someone'} liked your post`,
          link: '/',
          fromUserId: currentUser.uid,
          fromUserName: currentProfile?.name || 'Member',
          fromUserPhoto: currentProfile?.photoURL || '',
        });
      }
    } catch (err) {
      console.error('toggleLike failed', err);
      toast('Could not update like — check your connection');
    }
  }

  async function sharePost(post) {
    if (post.sharedFrom) {
      toast('Cannot reshare a shared post');
      return;
    }
    const alreadyShared = post.shares?.includes(currentUser.uid);
    if (alreadyShared) {
      toast('You already shared this post');
      return;
    }
    try {
      await addDoc(collection(db, 'posts'), {
        authorId: currentUser.uid,
        authorName: currentProfile?.name || 'Member',
        authorHeadline: currentProfile?.headline || '',
        authorPhotoURL: currentProfile?.photoURL || '',
        text: '',
        imageURL: '',
        videoURL: '',
        likes: [],
        shares: [],
        sharedFrom: {
          postId: post.id,
          authorId: post.authorId,
          authorName: post.authorName,
          authorPhotoURL: post.authorPhotoURL || '',
          text: post.text || '',
          imageURL: post.imageURL || '',
          videoURL: post.videoURL || '',
        },
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'posts', post.id), {
        shares: arrayUnion(currentUser.uid),
      });
      toast('Shared to your feed');
    } catch (err) {
      toast(err.message || 'Could not share');
    }
  }

  async function removePost(post) {
    if (post.authorId !== currentUser.uid) return;
    if (!confirm('Delete this post?')) return;
    await deleteDoc(doc(db, 'posts', post.id));
  }

  function renderMedia(imageURL, videoURL) {
    if (videoURL) {
      return (
        <video className="post-image" src={videoURL} controls playsInline />
      );
    }
    if (imageURL) {
      return <img className="post-image" src={imageURL} alt="" />;
    }
    return null;
  }

  return (
    <div className="feed-page">
      <form className="card composer" onSubmit={handlePost}>
        <div className="composer-top">
          <div className="avatar">
            {currentProfile?.photoURL
              ? <img src={currentProfile.photoURL} alt="" />
              : (currentProfile?.name?.[0] || 'M')}
          </div>
          <textarea
            placeholder="Share something with the distillery network..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
          />
        </div>
        {preview && (
          <div className="composer-preview">
            {mediaType === 'video'
              ? <video src={preview} controls playsInline />
              : <img src={preview} alt="preview" />}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setMedia(null); setMediaType(''); setPreview(''); }}>
              Remove
            </button>
          </div>
        )}
        <div className="composer-actions">
          <label className="btn btn-ghost btn-sm">
            📷 Photo
            <input type="file" accept="image/*" hidden onChange={handleMediaPick} />
          </label>
          <label className="btn btn-ghost btn-sm">
            🎥 Video
            <input type="file" accept="video/*" hidden onChange={handleMediaPick} />
          </label>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setShowSchedule((v) => !v)}
            disabled={!text.trim() && !media}
          >
            🕒 Schedule
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={posting || (!text.trim() && !media)}>
            {posting ? <span className="spinner" /> : 'Post'}
          </button>
        </div>
        {showSchedule && (
          <div className="composer-actions" style={{ marginTop: 8 }}>
            <input
              type="datetime-local"
              value={scheduleWhen}
              onChange={(e) => setScheduleWhen(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={posting || !scheduleWhen}
              onClick={handleSchedule}
            >
              {posting ? <span className="spinner" /> : 'Confirm schedule'}
            </button>
          </div>
        )}
      </form>

      {myScheduledPosts.length > 0 && (
        <div className="card">
          <h3 className="settings-subheading">Scheduled posts</h3>
          {myScheduledPosts.map((p) => (
            <div className="scheduled-banner" key={p.id} style={{ padding: '8px 12px', background: '#4f7fff15', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>🕒 "{(p.text || '(media post)').slice(0, 60)}" — {p.scheduledFor?.toDate ? p.scheduledFor.toDate().toLocaleString() : ''}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => cancelScheduledPost(p.id)}>Cancel</button>
            </div>
          ))}
        </div>
      )}

      {posts.length === 0 && (
        <div className="empty-state">No posts yet — be the first to share something.</div>
      )}

      {posts.map((post) => (
        <div className="card post" key={post.id}>
          <div className="post-header">
            <Link to={`/profile/${post.authorId}`} className="avatar">
              {post.authorPhotoURL ? <img src={post.authorPhotoURL} alt="" /> : (post.authorName?.[0] || '?')}
            </Link>
            <div className="post-author">
              <Link to={`/profile/${post.authorId}`} className="post-author-name">{post.authorName}</Link>
              {post.authorHeadline && <div className="post-author-headline">{post.authorHeadline}</div>}
              <div className="post-time">
                {post.sharedFrom ? 'shared a post · ' : ''}{timeAgo(post.createdAt)}
              </div>
            </div>
            {post.authorId === currentUser.uid && (
              <button className="btn btn-ghost btn-sm" onClick={() => removePost(post)}>Delete</button>
            )}
          </div>

          {post.text && <p className="post-text">{post.text}</p>}
          {!post.sharedFrom && renderMedia(post.imageURL, post.videoURL)}

          {post.sharedFrom && (
            <div className="card shared-post-inner" style={{ margin: '8px 0', padding: '10px' }}>
              <div className="post-header">
                <Link to={`/profile/${post.sharedFrom.authorId}`} className="avatar">
                  {post.sharedFrom.authorPhotoURL
                    ? <img src={post.sharedFrom.authorPhotoURL} alt="" />
                    : (post.sharedFrom.authorName?.[0] || '?')}
                </Link>
                <div className="post-author">
                  <Link to={`/profile/${post.sharedFrom.authorId}`} className="post-author-name">
                    {post.sharedFrom.authorName}
                  </Link>
                </div>
              </div>
              {post.sharedFrom.text && <p className="post-text">{post.sharedFrom.text}</p>}
              {renderMedia(post.sharedFrom.imageURL, post.sharedFrom.videoURL)}
            </div>
          )}

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
            {!post.sharedFrom && (
              <button
                type="button"
                className={'btn btn-ghost btn-sm' + (post.shares?.includes(currentUser.uid) ? ' active' : '')}
                onClick={() => sharePost(post)}
              >
                🔁 Share {post.shares?.length || 0}
              </button>
            )}
            <button
              type="button"
              className={'btn btn-ghost btn-sm' + (bookmarkIds.has(bookmarkDocId('post', post.id)) ? ' active' : '')}
              onClick={() => toggleBookmark(currentUser.uid, bookmarkIds.has(bookmarkDocId('post', post.id)), {
                type: 'post',
                itemId: post.id,
                title: post.authorName,
                snippet: (post.text || '').slice(0, 100),
                imageURL: post.authorPhotoURL || '',
                link: '/',
              })}
            >
              {bookmarkIds.has(bookmarkDocId('post', post.id)) ? '🔖 Saved' : '🔖 Save'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setShareItem({
                title: `${post.authorName}'s post`,
                snippet: (post.text || '').slice(0, 100),
                link: window.location.href,
              })}
            >
              📤 Share
            </button>
          </div>
          {openComments === post.id && (
            <Comments postId={post.id} postAuthorId={post.authorId} currentUser={currentUser} currentProfile={currentProfile} />
          )}
        </div>
      ))}

      {shareItem && <ShareSheet item={shareItem} onClose={() => setShareItem(null)} />}
    </div>
  );
}
