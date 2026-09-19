import { useEffect, useRef, useState, useCallback } from 'react';
import {
  collection, query, orderBy, onSnapshot, addDoc, deleteDoc, doc, updateDoc, setDoc,
  arrayUnion, arrayRemove, serverTimestamp, increment,
} from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { useLanguage } from './LanguageContext';
import { notify } from './notify';
import { IconX, IconTrash2, IconUpload, IconEye, IconFlag, IconMoreVertical, IconCheck, IconUser, IconChevronUp } from './Icons';
import { bookmarkDocId, toggleBookmark, listenBookmarks } from './bookmarks';
import { uploadToCloudinaryWithProgress } from './uploadUtils';
import ShareSheet from './ShareSheet';
import ReportDialog from './ReportDialog';
import { IconThumbsUp, IconComment, IconSend, IconVolume, IconVolumeMute, IconBookmark } from './Icons';

function getYouTubeId(url) {
  const m = url?.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  return m ? m[1] : null;
}

// Works for anything from a 4-second clip to a multi-hour upload.
function formatDuration(totalSeconds) {
  if (totalSeconds == null || Number.isNaN(totalSeconds) || !Number.isFinite(totalSeconds)) return null;
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// Compact view-count formatting: 950 -> "950", 1200 -> "1.2K", 2_400_000 -> "2.4M"
function formatCount(n) {
  const num = n || 0;
  if (num < 1000) return String(num);
  if (num < 1000000) return (num / 1000).toFixed(num % 1000 >= 100 ? 1 : 0) + 'K';
  return (num / 1000000).toFixed(1) + 'M';
}

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

// localStorage-backed sets (per-browser, not per-account) for "Not interested"
// hides and the "Watched" badge — these are lightweight UI conveniences, not
// synced data, so they don't need a Firestore round-trip.
function loadIdSet(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}
function saveIdSet(key, set) {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    // localStorage can fail (private mode, quota) — non-critical, ignore.
  }
}

/** Slide-up comments panel for one video — Firestore-backed, videos/{id}/comments subcollection. */
function VideoCommentsSheet({ video, currentUser, currentProfile, onClose }) {
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'videos', video.id, 'comments'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [video.id]);

  async function addComment(e) {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await addDoc(collection(db, 'videos', video.id, 'comments'), {
        authorId: currentUser.uid,
        authorName: currentProfile?.name || 'Member',
        authorPhotoURL: currentProfile?.photoURL || '',
        text: text.trim(),
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'videos', video.id), { commentCount: (video.commentCount || 0) + 1 });
      if (video.authorId !== currentUser.uid) {
        notify({
          toUserId: video.authorId,
          type: 'comment',
          message: `${currentProfile?.name || 'Someone'} commented on your video`,
          link: '/videos',
          fromUserId: currentUser.uid,
          fromUserName: currentProfile?.name || 'Member',
          fromUserPhoto: currentProfile?.photoURL || '',
        });
      }
      setText('');
    } catch (err) {
      console.error('addComment failed', err);
    }
    setSending(false);
  }

  async function removeComment(c) {
    if (c.authorId !== currentUser.uid) return;
    await deleteDoc(doc(db, 'videos', video.id, 'comments', c.id));
    await updateDoc(doc(db, 'videos', video.id), { commentCount: Math.max(0, (video.commentCount || 1) - 1) });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="card"
        style={{ maxWidth: 480, margin: '10vh auto 0', padding: 16, maxHeight: '75vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Comments</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><IconX className="w-4 h-4" /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', marginBottom: 10 }}>
          {comments.length === 0 && <div className="empty-state">No comments yet — be the first.</div>}
          {comments.map((c) => (
            <div className="comment-row" key={c.id}>
              <span className="comment-author">{c.authorName}</span> {c.text}
              <span className="status-viewer-row-time" style={{ marginLeft: 6 }}>{timeAgo(c.createdAt)}</span>
              {c.authorId === currentUser.uid && (
                <button className="btn btn-ghost btn-sm" onClick={() => removeComment(c)}><IconX className="w-3.5 h-3.5" /></button>
              )}
            </div>
          ))}
        </div>

        <form className="chat-input-row" onSubmit={addComment}>
          <input type="text" placeholder="Write a comment..." value={text} onChange={(e) => setText(e.target.value)} />
          <button type="submit" className="btn btn-primary btn-sm" disabled={sending || !text.trim()}>Send</button>
        </form>
      </div>
    </div>
  );
}

/** One full-bleed reel/video item — plays only while scrolled into view. */
function VideoItem({
  video, index, isOwner, isLiked, isSaved, isFollowing, isWatched, muted, setMuted,
  onDelete, onToggleLike, onOpenComments, onOpenShare, onToggleSave, onToggleFollow,
  onNotInterested, onOpenReport, onMarkWatched, onRegisterView, onInViewChange, preload,
}) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const [inView, setInView] = useState(false);
  const [duration, setDuration] = useState(null);
  const [progress, setProgress] = useState(0);
  const [showMenu, setShowMenu] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const [heartBurst, setHeartBurst] = useState(null); // { key, x, y } | null

  // Gesture bookkeeping — refs so they don't trigger re-renders.
  const holdTimerRef = useRef(null);
  const tapTimerRef = useRef(null);
  const tapCountRef = useRef(0);
  const heartKeyRef = useRef(0);
  const viewCountedRef = useRef(false);

  const ytId = getYouTubeId(video.videoURL);
  const likeCount = video.likes?.length || 0;
  const viewCount = video.views || 0;

  // ---- In-view detection (drives autoplay, active-index tracking, and
  // one-time view counting) ----
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting && entry.intersectionRatio > 0.6),
      { threshold: [0, 0.6, 1] }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    onInViewChange?.(index, inView);
    if (inView && !viewCountedRef.current) {
      viewCountedRef.current = true;
      onRegisterView?.(video);
    }
  }, [inView, index, onInViewChange, onRegisterView, video]);

  // ---- Autoplay control (native <video> only — YouTube handles its own
  // autoplay via the iframe URL params). Also pauses when the browser tab
  // is hidden, and resumes if the tab becomes visible again while in view. ----
  useEffect(() => {
    const el = videoRef.current;
    if (!el || ytId) return;

    function syncPlayback() {
      if (inView && !document.hidden && !isHolding) {
        el.play().catch(() => {});
      } else {
        el.pause();
      }
    }
    syncPlayback();

    document.addEventListener('visibilitychange', syncPlayback);
    return () => document.removeEventListener('visibilitychange', syncPlayback);
  }, [inView, ytId, isHolding]);

  function scrollToSibling(direction) {
    const el = containerRef.current;
    const target = direction === 'next' ? el?.nextElementSibling : el?.previousElementSibling;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleEnded() {
    onMarkWatched?.(video);
    scrollToSibling('next');
  }

  function handleTimeUpdate(e) {
    const el = e.currentTarget;
    if (el.duration) setProgress((el.currentTime / el.duration) * 100);
    // Treat "watched" as having played through most of the clip, even if
    // the user swipes away right before the very end.
    if (el.duration && el.currentTime / el.duration > 0.9) onMarkWatched?.(video);
  }

  // ---- Tap gesture handling: single tap = mute toggle, double tap = like
  // (with a heart-burst animation), press-and-hold = pause while held. ----
  function handlePointerDown(e) {
    if (ytId) return; // gestures only apply to the native <video> surface
    holdTimerRef.current = setTimeout(() => {
      setIsHolding(true);
      holdTimerRef.current = null;
    }, 220);
  }

  function handlePointerUp(e) {
    if (ytId) return;
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (isHolding) {
      setIsHolding(false);
      return; // this was a hold-to-pause gesture, not a tap
    }

    tapCountRef.current += 1;
    if (tapCountRef.current === 1) {
      tapTimerRef.current = setTimeout(() => {
        // Single tap confirmed (no second tap arrived in time) — toggle mute.
        setMuted((v) => !v);
        tapCountRef.current = 0;
      }, 260);
    } else {
      // Double tap — like + heart burst at the tap position.
      clearTimeout(tapTimerRef.current);
      tapCountRef.current = 0;
      if (!isLiked) onToggleLike(video);
      const rect = containerRef.current.getBoundingClientRect();
      const point = e.changedTouches?.[0] || e;
      heartKeyRef.current += 1;
      setHeartBurst({
        key: heartKeyRef.current,
        x: (point.clientX ?? rect.width / 2) - rect.left,
        y: (point.clientY ?? rect.height / 2) - rect.top,
      });
    }
  }

  return (
    <section
      ref={containerRef}
      className="relative flex w-full shrink-0 snap-start items-center justify-center bg-black"
      style={{ height: 'calc(100dvh - 116px)' }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => { if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; } setIsHolding(false); }}
    >
      {ytId ? (
        <iframe
          className="h-full w-full"
          src={`https://www.youtube.com/embed/${ytId}?playsinline=1${inView ? '&autoplay=1&mute=1' : ''}`}
          title={video.title}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <video
          ref={videoRef}
          src={video.videoURL}
          className="h-full w-full object-contain"
          playsInline
          muted={muted}
          preload={preload}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
        />
      )}

      {/* Progress bar — thin line at the very top, Stories-style */}
      {!ytId && (
        <div className="absolute inset-x-0 top-0 h-[3px] bg-white/20 z-10">
          <div className="h-full bg-white transition-[width] duration-150 ease-linear" style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* Hold-to-pause indicator */}
      {isHolding && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/40 text-3xl text-white">⏸</span>
        </div>
      )}

      {/* Double-tap heart burst */}
      {heartBurst && (
        <span
          key={heartBurst.key}
          onAnimationEnd={() => setHeartBurst(null)}
          className="pointer-events-none absolute text-5xl animate-[dh-heart-pop_0.7s_ease-out_forwards]"
          style={{ left: heartBurst.x, top: heartBurst.y, transform: 'translate(-50%, -50%)' }}
        >
          ❤️
        </span>
      )}

      {/* Duration / source badge */}
      <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px]
                       font-semibold text-white backdrop-blur">
        {ytId ? 'YouTube' : formatDuration(duration) || '•'}
      </span>

      {/* View count, just under the duration badge */}
      <span className="absolute right-3 top-11 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px]
                       font-semibold text-white backdrop-blur">
        <IconEye className="w-3.5 h-3.5" /> {formatCount(viewCount)}
      </span>

      {/* Watched badge */}
      {isWatched && (
        <span className="absolute left-3 top-14 rounded-full bg-black/60 px-2.5 py-1 text-[10.5px]
                         font-semibold text-slate-300 backdrop-blur flex items-center gap-1">
          <IconCheck className="w-3 h-3" /> Watched
        </span>
      )}

      {/* Mute toggle — native videos only (also reachable via single-tap) */}
      {!ytId && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setMuted((v) => !v); }}
          className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full
                     bg-black/60 text-white backdrop-blur"
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <IconVolumeMute className="w-4 h-4" /> : <IconVolume className="w-4 h-4" />}
        </button>
      )}

      {/* "..." menu — Not interested / Report */}
      <div className="absolute right-3 bottom-[max(120px,20%)]">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setShowMenu((v) => !v); }}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white active:scale-90"
          aria-label="More options"
        >
          <IconMoreVertical className="w-5 h-5" />
        </button>
        {showMenu && (
          <div
            className="absolute right-0 mt-1 w-44 overflow-hidden rounded-lg border border-slate-700 bg-navy-card shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => { setShowMenu(false); onNotInterested(video); }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] text-slate-200 hover:bg-navy-cardAlt"
            >
              <IconX className="w-4 h-4" /> Not interested
            </button>
            {!isOwner && (
              <button
                type="button"
                onClick={() => { setShowMenu(false); onOpenReport(video); }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] text-slate-200 hover:bg-navy-cardAlt"
              >
                <IconFlag className="w-4 h-4" /> Report
              </button>
            )}
          </div>
        )}
      </div>

      {/* Up / Down swipe buttons — same effect as scrolling, for anyone
          who'd rather tap than swipe. */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-3">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); scrollToSibling('prev'); }}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white active:scale-90"
          aria-label="Previous video"
        >
          <IconChevronUp className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); scrollToSibling('next'); }}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white active:scale-90"
          aria-label="Next video"
          style={{ transform: 'rotate(180deg)' }}
        >
          <IconChevronUp className="w-5 h-5" />
        </button>
      </div>

      {/* Bottom-left: title / author / description / follow */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t
                      from-black/80 via-black/20 to-transparent p-4 pr-16">
        <div className="pointer-events-auto flex items-center gap-2">
          <span className="text-[13px] font-semibold text-white">@{video.authorName || 'member'}</span>
          {!isOwner && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleFollow(video); }}
              className={'flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ' +
                (isFollowing ? 'bg-white/15 text-white' : 'bg-brand text-white')}
            >
              {isFollowing ? (<><IconCheck className="w-3 h-3" /> Following</>) : (<><IconUser className="w-3 h-3" /> Follow</>)}
            </button>
          )}
        </div>
        <div className="mt-0.5 text-[14px] font-medium text-white line-clamp-2">{video.title}</div>
        {video.description && (
          <div className="mt-0.5 text-[12.5px] text-slate-300 line-clamp-2">{video.description}</div>
        )}
      </div>

      {/* Right-side action rail — Like / Comment / Save / Share / (Delete if owner) */}
      <div className="absolute bottom-4 right-2 flex flex-col items-center gap-4">
        <button type="button" onClick={(e) => { e.stopPropagation(); onToggleLike(video); }} className="flex flex-col items-center gap-1 text-white active:scale-90">
          <span className={'flex h-10 w-10 items-center justify-center rounded-full bg-black/50 ' + (isLiked ? 'text-brand' : '')}>
            <IconThumbsUp className="w-5 h-5" />
          </span>
          <span className="text-[11px] font-semibold">{likeCount}</span>
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); onOpenComments(video); }} className="flex flex-col items-center gap-1 text-white active:scale-90">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50">
            <IconComment className="w-5 h-5" />
          </span>
          <span className="text-[11px] font-semibold">{video.commentCount || 0}</span>
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); onToggleSave(video); }} className="flex flex-col items-center gap-1 text-white active:scale-90">
          <span className={'flex h-10 w-10 items-center justify-center rounded-full bg-black/50 ' + (isSaved ? 'text-brand' : '')}>
            <IconBookmark className="w-5 h-5" filled={isSaved} />
          </span>
          <span className="text-[11px] font-semibold">{isSaved ? 'Saved' : 'Save'}</span>
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); onOpenShare(video); }} className="flex flex-col items-center gap-1 text-white active:scale-90">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50">
            <IconSend className="w-5 h-5" />
          </span>
        </button>
        {isOwner && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(video); }}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white active:scale-90"
            aria-label="Delete"
          >
            <IconTrash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </section>
  );
}

export default function Videos() {
  const { currentUser, currentProfile } = useAuth();
  const toast = useToast();
  const { t } = useLanguage();
  const [videos, setVideos] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', videoURL: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadPreview, setUploadPreview] = useState('');
  const [uploadPct, setUploadPct] = useState(0);
  const [bookmarkIds, setBookmarkIds] = useState(new Set());
  const [commentsFor, setCommentsFor] = useState(null);
  const [shareItem, setShareItem] = useState(null);
  const [reportingVideo, setReportingVideo] = useState(null);

  // Shared mute state — one video's mute/unmute choice now carries over to
  // the next video, matching how Reels/Shorts behave (previously each
  // <video> had its own local `muted` state, so every new video reset back
  // to muted).
  const [muted, setMuted] = useState(true);

  // Which video index is currently the "active" (in-view) one — used only
  // to decide which video(s) to preload next, not for rendering.
  const [activeIndex, setActiveIndex] = useState(0);

  const [hiddenIds, setHiddenIds] = useState(() => loadIdSet('dh-hidden-videos'));
  const [watchedIds, setWatchedIds] = useState(() => loadIdSet('dh-watched-videos'));
  const [followingIds, setFollowingIds] = useState(new Set());

  function handleFilePick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      toast('Please choose a video file');
      e.target.value = '';
      return;
    }
    if (file.size > 200 * 1024 * 1024) {
      toast('Video too large (max ~200MB) — try a shorter clip or paste a link instead');
      e.target.value = '';
      return;
    }
    setUploadFile(file);
    setUploadPreview(URL.createObjectURL(file));
    setForm((f) => ({ ...f, videoURL: '' })); // uploading a file overrides the link field
  }

  function uploadVideoFile(file) {
    return uploadToCloudinaryWithProgress(file, 'video', setUploadPct);
  }

  useEffect(() => {
    const q = query(collection(db, 'videos'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setVideos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    return listenBookmarks(currentUser.uid, (list) => setBookmarkIds(new Set(list.map((b) => b.id))));
  }, [currentUser]);

  // Who the current user follows — a lightweight `follows` collection,
  // one doc per (follower, following) pair, mirroring how bookmarks works.
  // NOTE: if your Firestore rules don't yet have a rule for a `follows`
  // collection, the toggleFollow() write below will fail with a
  // permission-denied error (caught + shown as a toast) rather than
  // crashing anything — add a rule for it if you want Follow to work.
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, 'follows'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const mine = snap.docs
        .map((d) => d.data())
        .filter((f) => f.followerId === currentUser.uid)
        .map((f) => f.followingId);
      setFollowingIds(new Set(mine));
    }, () => {
      // Swallow permission-denied etc. — Follow simply won't reflect state
      // if the collection/rule doesn't exist yet.
    });
    return unsub;
  }, [currentUser]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!form.title.trim() || (!form.videoURL.trim() && !uploadFile)) return;
    setSaving(true);
    try {
      let finalVideoURL = form.videoURL.trim();
      if (uploadFile) {
        setUploadPct(0);
        finalVideoURL = await uploadVideoFile(uploadFile);
      }
      await addDoc(collection(db, 'videos'), {
        title: form.title.trim(),
        videoURL: finalVideoURL,
        description: form.description,
        authorId: currentUser.uid,
        authorName: currentProfile?.name || 'Member',
        likes: [],
        commentCount: 0,
        views: 0,
        createdAt: serverTimestamp(),
      });
      setForm({ title: '', videoURL: '', description: '' });
      setUploadFile(null);
      setUploadPreview('');
      setUploadPct(0);
      setShowForm(false);
      toast('Video shared');
    } catch (err) {
      console.error('Video share failed', err);
      toast(err.message || 'Could not share video');
    }
    setSaving(false);
  }, [form, uploadFile, currentUser, currentProfile, toast]);

  async function removeVideo(video) {
    if (video.authorId !== currentUser.uid) return;
    if (!confirm('Delete this video?')) return;
    await deleteDoc(doc(db, 'videos', video.id));
  }

  async function toggleLike(video) {
    const liked = video.likes?.includes(currentUser.uid);
    try {
      await updateDoc(doc(db, 'videos', video.id), {
        likes: liked ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid),
      });
      if (!liked && video.authorId !== currentUser.uid) {
        notify({
          toUserId: video.authorId,
          type: 'like',
          message: `${currentProfile?.name || 'Someone'} liked your video`,
          link: '/videos',
          fromUserId: currentUser.uid,
          fromUserName: currentProfile?.name || 'Member',
          fromUserPhoto: currentProfile?.photoURL || '',
        });
      }
    } catch (err) {
      console.error('toggleLike (video) failed', err);
      toast('Could not update like — check your connection');
    }
  }

  function handleToggleSave(video) {
    const id = bookmarkDocId('video', video.id);
    toggleBookmark(currentUser.uid, bookmarkIds.has(id), {
      type: 'video',
      itemId: video.id,
      title: video.title,
      snippet: `by ${video.authorName || 'member'}`,
      imageURL: '',
      link: '/videos',
    }).catch(() => toast('Could not update saved videos'));
  }

  async function toggleFollow(video) {
    if (!currentUser || video.authorId === currentUser.uid) return;
    const followDocId = `${currentUser.uid}_${video.authorId}`;
    const isFollowing = followingIds.has(video.authorId);
    try {
      if (isFollowing) {
        await deleteDoc(doc(db, 'follows', followDocId));
      } else {
        await setDoc(doc(db, 'follows', followDocId), {
          followerId: currentUser.uid,
          followingId: video.authorId,
          createdAt: serverTimestamp(),
        });
        notify({
          toUserId: video.authorId,
          type: 'follow',
          message: `${currentProfile?.name || 'Someone'} started following you`,
          link: '/videos',
          fromUserId: currentUser.uid,
          fromUserName: currentProfile?.name || 'Member',
          fromUserPhoto: currentProfile?.photoURL || '',
        });
      }
    } catch (err) {
      console.error('toggleFollow failed', err);
      toast('Could not update follow — this may need a Firestore rule for "follows"');
    }
  }

  function handleNotInterested(video) {
    setHiddenIds((prev) => {
      const next = new Set(prev).add(video.id);
      saveIdSet('dh-hidden-videos', next);
      return next;
    });
    toast('Got it — you\u2019ll see less like this');
  }

  function handleMarkWatched(video) {
    setWatchedIds((prev) => {
      if (prev.has(video.id)) return prev;
      const next = new Set(prev).add(video.id);
      saveIdSet('dh-watched-videos', next);
      return next;
    });
  }

  // One view per video per session — increments the shared `views` counter
  // on the video doc the first time it scrolls into view.
  function handleRegisterView(video) {
    updateDoc(doc(db, 'videos', video.id), { views: increment(1) }).catch(() => {});
  }

  function handleOpenShare(video) {
    setShareItem({
      title: video.title || 'A video on DistilleryHub',
      snippet: `Shared by ${video.authorName || 'member'}`,
      link: window.location.origin + window.location.pathname.replace(/\/$/, '') + '/videos',
    });
  }

  const visibleVideos = videos.filter((v) => !hiddenIds.has(v.id));

  return (
    <div className="-mx-3 -mt-3 sm:-mx-4">
      {/* Keyframe for the double-tap heart-burst animation (referenced via
          Tailwind's arbitrary `animate-[...]` utility on the heart span). */}
      <style>{`
        @keyframes dh-heart-pop {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.3); }
          25% { opacity: 1; transform: translate(-50%, -50%) scale(1.15); }
          40% { transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1) translateY(-30px); }
        }
      `}</style>

      {/* Upload bar */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-navy-card px-4 py-2.5">
        <span className="text-[13px] font-semibold text-white">
          {t('nav.videos')} <span className="text-slate-500">· reels &amp; long videos, any length</span>
        </span>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-full bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-white active:scale-95"
        >
          {showForm ? 'Cancel' : '+ Upload'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-2 border-b border-slate-800 bg-navy-card px-4 py-3">
          <input
            type="text" placeholder="Title" value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full rounded-lg border border-slate-700 bg-navy-cardAlt px-3 py-2 text-[13.5px] text-white placeholder:text-slate-500"
          />

          <label className="flex items-center justify-center gap-2 w-full rounded-lg border border-dashed border-slate-600 bg-navy-cardAlt px-3 py-3 text-[13px] text-slate-300 active:scale-[0.99]">
            {uploadFile ? `Selected: ${uploadFile.name}` : (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconUpload className="w-4 h-4" /> Upload a video file from your device</span>)}
            <input type="file" accept="video/*" hidden onChange={handleFilePick} />
          </label>
          {uploadPreview && (
            <div className="space-y-1">
              <video src={uploadPreview} controls playsInline className="w-full rounded-lg max-h-52" />
              {saving && uploadFile && (
                <div className="h-1.5 w-full rounded-full bg-slate-700 overflow-hidden">
                  <div className="h-full bg-brand transition-all" style={{ width: `${uploadPct}%` }} />
                </div>
              )}
              <button
                type="button"
                onClick={() => { setUploadFile(null); setUploadPreview(''); setUploadPct(0); }}
                className="text-[12px] text-slate-400 underline"
              >
                Remove selected file
              </button>
            </div>
          )}

          <div className="text-center text-[11px] text-slate-500">— or paste a link instead —</div>

          <input
            type="text" placeholder="YouTube link, Shorts link, or direct video URL (mp4)" value={form.videoURL}
            disabled={!!uploadFile}
            onChange={(e) => setForm({ ...form, videoURL: e.target.value })}
            className="w-full rounded-lg border border-slate-700 bg-navy-cardAlt px-3 py-2 text-[13.5px] text-white placeholder:text-slate-500 disabled:opacity-40"
          />
          <textarea
            placeholder="Description" rows={2} value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full rounded-lg border border-slate-700 bg-navy-cardAlt px-3 py-2 text-[13.5px] text-white placeholder:text-slate-500"
          />
          <p className="text-[11.5px] text-slate-500">
            Works for anything — a 15-second reel, a 10-minute tutorial, or a multi-hour recording.
          </p>
          <button
            type="submit" disabled={saving}
            className="w-full rounded-lg bg-brand py-2 text-[13.5px] font-semibold text-white disabled:opacity-60"
          >
            {saving ? 'Sharing…' : 'Share'}
          </button>
        </form>
      )}

      {visibleVideos.length === 0 && (
        <div className="px-4 py-10 text-center text-[13.5px] text-slate-500">No videos yet.</div>
      )}

      {/* Vertical snap-scroll reels feed */}
      <div
        className="snap-y snap-mandatory overflow-y-scroll"
        style={{ height: 'calc(100dvh - 116px)' }}
      >
        {visibleVideos.map((video, i) => (
          <VideoItem
            key={video.id}
            video={video}
            index={i}
            isOwner={video.authorId === currentUser?.uid}
            isLiked={!!video.likes?.includes(currentUser?.uid)}
            isSaved={bookmarkIds.has(bookmarkDocId('video', video.id))}
            isFollowing={followingIds.has(video.authorId)}
            isWatched={watchedIds.has(video.id)}
            muted={muted}
            setMuted={setMuted}
            preload={Math.abs(i - activeIndex) <= 1 ? 'auto' : 'metadata'}
            onDelete={removeVideo}
            onToggleLike={toggleLike}
            onOpenComments={(v) => setCommentsFor(v)}
            onOpenShare={handleOpenShare}
            onToggleSave={handleToggleSave}
            onToggleFollow={toggleFollow}
            onNotInterested={handleNotInterested}
            onOpenReport={(v) => setReportingVideo(v)}
            onMarkWatched={handleMarkWatched}
            onRegisterView={handleRegisterView}
            onInViewChange={(idx, inView) => { if (inView) setActiveIndex(idx); }}
          />
        ))}
      </div>

      {commentsFor && (
        <VideoCommentsSheet
          video={commentsFor}
          currentUser={currentUser}
          currentProfile={currentProfile}
          onClose={() => setCommentsFor(null)}
        />
      )}

      {shareItem && <ShareSheet item={shareItem} onClose={() => setShareItem(null)} />}

      {reportingVideo && (
        <ReportDialog
          targetType="video"
          targetId={reportingVideo.id}
          extra={{
            videoTitle: reportingVideo.title || '',
            videoAuthorId: reportingVideo.authorId,
          }}
          onClose={() => setReportingVideo(null)}
          onSubmitted={() => toast('Report submitted. Thanks for flagging this.')}
        />
      )}
    </div>
  );
}
