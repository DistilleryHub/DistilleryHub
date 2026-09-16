import { useEffect, useRef, useState, useCallback } from 'react';
import {
  collection, query, orderBy, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db, apiFetch } from './firebase';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { useLanguage } from './LanguageContext';
import { IconThumbsUp, IconComment, IconSend, IconVolume, IconVolumeMute } from './Icons';

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

/** One full-bleed reel/video item — plays only while scrolled into view. */
function VideoItem({ video, isOwner, onDelete, t }) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const [inView, setInView] = useState(false);
  const [muted, setMuted] = useState(true);
  const [duration, setDuration] = useState(null);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(video.likeCount || 0);

  const ytId = getYouTubeId(video.videoURL);

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
    const el = videoRef.current;
    if (!el || ytId) return; // autoplay control only applies to native <video>, not YouTube iframes
    if (inView) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [inView, ytId]);

  function toggleLike() {
    setLiked((v) => !v);
    setLikeCount((c) => (liked ? c - 1 : c + 1));
  }

  return (
    <section
      ref={containerRef}
      className="relative flex w-full shrink-0 snap-start items-center justify-center
                 bg-black"
      style={{ height: 'calc(100dvh - 116px)' }}
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
          loop
          playsInline
          muted={muted}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onClick={() => setMuted((v) => !v)}
        />
      )}

      {/* Duration / source badge */}
      <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px]
                       font-semibold text-white backdrop-blur">
        {ytId ? 'YouTube' : formatDuration(duration) || '•'}
      </span>

      {/* Mute toggle — native videos only */}
      {!ytId && (
        <button
          type="button"
          onClick={() => setMuted((v) => !v)}
          className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full
                     bg-black/60 text-white backdrop-blur"
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <IconVolumeMute className="w-4 h-4" /> : <IconVolume className="w-4 h-4" />}
        </button>
      )}

      {/* Bottom-left: title / author / description */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t
                      from-black/80 via-black/20 to-transparent p-4 pr-16">
        <div className="text-[13px] font-semibold text-white">@{video.authorName || 'member'}</div>
        <div className="mt-0.5 text-[14px] font-medium text-white line-clamp-2">{video.title}</div>
        {video.description && (
          <div className="mt-0.5 text-[12.5px] text-slate-300 line-clamp-2">{video.description}</div>
        )}
      </div>

      {/* Right-side action rail — Like / Comment / Send / (Delete if owner) */}
      <div className="absolute bottom-4 right-2 flex flex-col items-center gap-4">
        <button type="button" onClick={toggleLike} className="flex flex-col items-center gap-1 text-white active:scale-90">
          <span className={'flex h-10 w-10 items-center justify-center rounded-full bg-black/50 ' + (liked ? 'text-brand' : '')}>
            <IconThumbsUp className="w-5 h-5" />
          </span>
          <span className="text-[11px] font-semibold">{likeCount}</span>
        </button>
        <button type="button" className="flex flex-col items-center gap-1 text-white active:scale-90">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50">
            <IconComment className="w-5 h-5" />
          </span>
          <span className="text-[11px] font-semibold">{video.commentCount || 0}</span>
        </button>
        <button type="button" className="flex flex-col items-center gap-1 text-white active:scale-90">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50">
            <IconSend className="w-5 h-5" />
          </span>
        </button>
        {isOwner && (
          <button
            type="button"
            onClick={() => onDelete(video)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white active:scale-90"
            aria-label="Delete"
          >
            🗑️
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
    return new Promise((resolve, reject) => {
      apiFetch('/api/cloudinarySign').then((sig) => {
        const xhr = new XMLHttpRequest();
        const fd = new FormData();
        fd.append('file', file);
        fd.append('api_key', sig.apiKey);
        fd.append('timestamp', sig.timestamp);
        fd.append('signature', sig.signature);
        fd.append('folder', sig.folder);
        xhr.open('POST', `https://api.cloudinary.com/v1_1/${sig.cloudName}/video/upload`);
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setUploadPct(Math.round((ev.loaded / ev.total) * 100));
        };
        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText);
            if (data.secure_url) resolve(data.secure_url);
            else {
              console.error('Cloudinary video upload error:', data);
              reject(new Error(data?.error?.message || 'Video upload failed'));
            }
          } catch (e) { reject(e); }
        };
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(fd);
      }).catch((err) => {
        if (err.status === 429) {
          reject(new Error('Upload limit reached — try again in a few minutes.'));
        } else {
          reject(new Error('Could not start upload: ' + err.message));
        }
      });
    });
  }

  useEffect(() => {
    const q = query(collection(db, 'videos'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setVideos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

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

  return (
    <div className="-mx-3 -mt-3 sm:-mx-4">
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
            {uploadFile ? `Selected: ${uploadFile.name}` : '📤 Upload a video file from your device'}
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

      {videos.length === 0 && (
        <div className="px-4 py-10 text-center text-[13.5px] text-slate-500">No videos yet.</div>
      )}

      {/* Vertical snap-scroll reels feed */}
      <div
        className="snap-y snap-mandatory overflow-y-scroll"
        style={{ height: 'calc(100dvh - 116px)' }}
      >
        {videos.map((video) => (
          <VideoItem
            key={video.id}
            video={video}
            isOwner={video.authorId === currentUser?.uid}
            onDelete={removeVideo}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}
