import { useState } from 'react';
import { IconThumbsUp, IconComment, IconRepeat, IconSend } from './Icons';

/**
 * post shape:
 * {
 *   id, author: { name, headline, avatarUrl, isFollowing },
 *   timestamp: string,              // already formatted, e.g. "1d"
 *   caption: string,
 *   media: { type: 'image' | 'video', url: string } | null,
 *   likeCount, commentCount, repostCount,
 *   likedByMe: boolean,
 * }
 */
export default function PostCard({ post, onFollow, onLike, onComment, onRepost, onSend }) {
  const [liked, setLiked] = useState(!!post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount || 0);
  const [following, setFollowing] = useState(!!post.author?.isFollowing);

  function handleLike() {
    setLiked((v) => !v);
    setLikeCount((c) => (liked ? c - 1 : c + 1));
    onLike?.(post);
  }

  function handleFollow() {
    setFollowing(true);
    onFollow?.(post);
  }

  return (
    <article className="w-full overflow-hidden rounded-xl border border-slate-800 bg-navy-card shadow-card">
      {/* Header */}
      <div className="flex items-start gap-3 p-4">
        {post.author?.avatarUrl ? (
          <img src={post.author.avatarUrl} alt="" className="h-11 w-11 rounded-full object-cover" />
        ) : (
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-700 text-white font-semibold">
            {(post.author?.name || '?')[0]?.toUpperCase()}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-white leading-tight">{post.author?.name}</div>
          {post.author?.headline && (
            <div className="truncate text-[13px] text-slate-400 leading-tight">{post.author.headline}</div>
          )}
          <div className="text-[12px] text-slate-500">{post.timestamp}</div>
        </div>

        {!following && (
          <button
            type="button"
            onClick={handleFollow}
            className="shrink-0 rounded-full border border-brand px-3 py-1 text-[13px] font-semibold
                       text-brand transition hover:bg-brand/10 active:scale-95"
          >
            + Follow
          </button>
        )}
      </div>

      {/* Caption */}
      {post.caption && (
        <p className="whitespace-pre-line px-4 pb-3 text-[14.5px] leading-relaxed text-slate-200">
          {post.caption}
        </p>
      )}

      {/* Media — full-width, edge-to-edge, no inner padding */}
      {post.media?.url && (
        <div className="w-full bg-black">
          {post.media.type === 'video' ? (
            <video src={post.media.url} controls className="block w-full max-h-[520px] object-contain" />
          ) : (
            <img src={post.media.url} alt="" className="block w-full max-h-[520px] object-cover" />
          )}
        </div>
      )}

      {/* Engagement counters */}
      <div className="flex items-center justify-between px-4 pt-3 text-[12.5px] text-slate-400">
        <span className="flex items-center gap-1">
          <IconThumbsUp className="w-3.5 h-3.5" aria-hidden /> {likeCount}
        </span>
        <span className="flex items-center gap-3">
          <span>{post.commentCount || 0} comments</span>
          <span>{post.repostCount || 0} reposts</span>
        </span>
      </div>

      <div className="mx-4 mt-3 border-t border-slate-800" />

      {/* Action bar */}
      <div className="flex items-center justify-between px-2 py-1">
        <ActionButton
          active={liked}
          activeClass="text-brand"
          icon={<IconThumbsUp className="w-[18px] h-[18px]" />}
          label="Like"
          onClick={handleLike}
        />
        <ActionButton
          icon={<IconComment className="w-[18px] h-[18px]" />}
          label="Comment"
          onClick={() => onComment?.(post)}
        />
        <ActionButton
          icon={<IconRepeat className="w-[18px] h-[18px]" />}
          label="Repost"
          onClick={() => onRepost?.(post)}
        />
        <ActionButton
          icon={<IconSend className="w-[18px] h-[18px]" />}
          label="Send"
          onClick={() => onSend?.(post)}
        />
      </div>
    </article>
  );
}

function ActionButton({ icon, label, onClick, active, activeClass = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-[13px] font-medium ' +
        'transition active:scale-95 active:bg-navy-cardAlt hover:bg-navy-cardAlt ' +
        (active ? activeClass : 'text-slate-400')
      }
    >
      {icon}
      {label}
    </button>
  );
}
