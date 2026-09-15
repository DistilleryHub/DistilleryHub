import { useEffect, useState } from 'react';
import {
  collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
  serverTimestamp, arrayUnion, arrayRemove, increment, writeBatch, where, getDocs,
} from 'firebase/firestore';
import { db, CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from './firebase';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { notify } from './notify';
import { bookmarkDocId, toggleBookmark, listenBookmarks } from './bookmarks';
import ShareSheet from './ShareSheet';

const CATEGORIES = ['Distillation', 'Quality Control', 'Regulations', 'Equipment', 'Market Trends', 'Others'];

function readTime(text) {
  const words = (text || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

// Very small markdown-lite renderer: # / ## headings, **bold**, *italic*, - bullets.
function renderInline(line, key) {
  const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter((p) => p !== '');
  return (
    <span key={key}>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
        if (part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>;
        return part;
      })}
    </span>
  );
}

function renderArticleBody(text) {
  const lines = (text || '').split('\n');
  const blocks = [];
  let listBuffer = [];
  const flushList = () => {
    if (listBuffer.length) {
      blocks.push(<ul key={`ul-${blocks.length}`} style={{ margin: '8px 0', paddingLeft: 20 }}>{listBuffer}</ul>);
      listBuffer = [];
    }
  };
  lines.forEach((line, i) => {
    if (line.startsWith('- ')) {
      listBuffer.push(<li key={i}>{renderInline(line.slice(2), `li-${i}`)}</li>);
      return;
    }
    flushList();
    if (line.startsWith('## ')) {
      blocks.push(<h3 key={i} style={{ marginTop: 14 }}>{renderInline(line.slice(3), `h3-${i}`)}</h3>);
    } else if (line.startsWith('# ')) {
      blocks.push(<h2 key={i} style={{ marginTop: 16 }}>{renderInline(line.slice(2), `h2-${i}`)}</h2>);
    } else if (line.trim() === '') {
      blocks.push(<div key={i} style={{ height: 8 }} />);
    } else {
      blocks.push(<p key={i} className="article-body">{renderInline(line, `p-${i}`)}</p>);
    }
  });
  flushList();
  return blocks;
}

function ArticleComments({ articleId, articleAuthorId, currentUser, currentProfile }) {
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'articles', articleId, 'comments'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [articleId]);

  async function addComment(e) {
    e.preventDefault();
    if (!text.trim()) return;
    await addDoc(collection(db, 'articles', articleId, 'comments'), {
      authorId: currentUser.uid,
      authorName: currentProfile?.name || 'Member',
      text: text.trim(),
      createdAt: serverTimestamp(),
    });
    notify({
      toUserId: articleAuthorId,
      type: 'comment',
      message: `${currentProfile?.name || 'Someone'} commented on your article`,
      link: '/articles',
      fromUserId: currentUser.uid,
      fromUserName: currentProfile?.name || 'Member',
      fromUserPhoto: currentProfile?.photoURL || '',
    });
    setText('');
  }

  async function removeComment(c) {
    if (c.authorId !== currentUser.uid) return;
    await deleteDoc(doc(db, 'articles', articleId, 'comments', c.id));
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

const EMPTY_FORM = { title: '', body: '', category: CATEGORIES[0] };

export default function Articles() {
  const { currentUser, currentProfile, isAdmin } = useAuth();
  const toast = useToast();
  const [articles, setArticles] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [cover, setCover] = useState(null);
  const [coverPreview, setCoverPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [openArticle, setOpenArticle] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showDrafts, setShowDrafts] = useState(false);
  const [bookmarkIds, setBookmarkIds] = useState(new Set());
  const [shareItem, setShareItem] = useState(null);

  useEffect(() => {
    if (!currentUser) return;
    return listenBookmarks(currentUser.uid, (list) => setBookmarkIds(new Set(list.map((b) => b.id))));
  }, [currentUser]);

  useEffect(() => {
    const q = query(collection(db, 'articles'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setArticles(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  function handleCoverPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCover(file);
    setCoverPreview(URL.createObjectURL(file));
  }

  function startEdit(article) {
    setEditingId(article.id);
    setForm({ title: article.title, body: article.body, category: article.category || CATEGORIES[0] });
    setCoverPreview(article.coverImageURL || '');
    setCover(null);
    setShowForm(true);
    setOpenArticle(null);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setCover(null);
    setCoverPreview('');
  }

  async function handleSave(e, publish) {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) return;
    setSaving(true);
    try {
      let coverImageURL = coverPreview && !cover ? coverPreview : '';
      if (cover) {
        const fd = new FormData();
        fd.append('file', cover);
        fd.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
        const res = await fetch(
          `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
          { method: 'POST', body: fd }
        );
        const data = await res.json();
        if (!data.secure_url) throw new Error('Cover upload failed');
        coverImageURL = data.secure_url;
      }

      if (editingId) {
        await updateDoc(doc(db, 'articles', editingId), {
          title: form.title.trim(),
          body: form.body.trim(),
          category: form.category,
          coverImageURL,
          status: publish ? 'published' : 'draft',
          updatedAt: serverTimestamp(),
        });
        toast(publish ? 'Article updated & published' : 'Draft updated');
      } else {
        await addDoc(collection(db, 'articles'), {
          title: form.title.trim(),
          body: form.body.trim(),
          category: form.category,
          coverImageURL,
          status: publish ? 'published' : 'draft',
          authorId: currentUser.uid,
          authorName: currentProfile?.name || 'Member',
          authorPhotoURL: currentProfile?.photoURL || '',
          likes: [],
          viewCount: 0,
          featured: false,
          createdAt: serverTimestamp(),
        });
        toast(publish ? 'Article published' : 'Saved as draft');
      }
      cancelForm();
    } catch (err) {
      toast(err.message || 'Could not save');
    }
    setSaving(false);
  }

  async function removeArticle(article) {
    if (article.authorId !== currentUser.uid && !isAdmin) return;
    if (!confirm('Delete this article?')) return;
    await deleteDoc(doc(db, 'articles', article.id));
    if (openArticle?.id === article.id) setOpenArticle(null);
  }

  function openArt(article) {
    setOpenArticle(article);
    // Count a view once per open, skip the author's own reads.
    if (article.authorId !== currentUser.uid) {
      updateDoc(doc(db, 'articles', article.id), { viewCount: increment(1) }).catch(() => {});
    }
  }

  async function toggleLike(article) {
    const liked = article.likes?.includes(currentUser.uid);
    try {
      await updateDoc(doc(db, 'articles', article.id), {
        likes: liked ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid),
      });
      if (!liked && article.authorId !== currentUser.uid) {
        notify({
          toUserId: article.authorId,
          type: 'like',
          message: `${currentProfile?.name || 'Someone'} liked your article "${article.title}"`,
          link: '/articles',
          fromUserId: currentUser.uid,
          fromUserName: currentProfile?.name || 'Member',
          fromUserPhoto: currentProfile?.photoURL || '',
        });
      }
    } catch (err) {
      toast('Could not update like — check your connection');
    }
  }

  // Admin-only: mark one article as "Article of the Month" — unsets any
  // previously featured article first so there's only ever one at a time.
  async function setFeatured(article) {
    try {
      const q = query(collection(db, 'articles'), where('featured', '==', true));
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      snap.docs.forEach((d) => {
        if (d.id !== article.id) batch.update(d.ref, { featured: false });
      });
      batch.update(doc(db, 'articles', article.id), { featured: true });
      await batch.commit();
      toast('Set as Article of the Month');
    } catch (err) {
      toast('Could not set Article of the Month');
    }
  }

  async function unfeature(article) {
    await updateDoc(doc(db, 'articles', article.id), { featured: false });
  }

  const published = articles.filter((a) => a.status !== 'draft');
  const myDrafts = articles.filter((a) => a.status === 'draft' && a.authorId === currentUser.uid);
  const featuredArticle = published.find((a) => a.featured);
  const visibleArticles = published.filter(
    (a) => (categoryFilter === 'all' || a.category === categoryFilter) && !a.featured
  );

  // ---------- Full article reading view ----------
  if (openArticle) {
    const savedOpen = bookmarkIds.has(bookmarkDocId('article', openArticle.id));
    const liked = openArticle.likes?.includes(currentUser.uid);
    return (
      <div className="articles-page">
        <button className="btn btn-ghost btn-sm" onClick={() => setOpenArticle(null)}>← Back to articles</button>
        <div className="card article-full">
          {openArticle.featured && <div className="badge" style={{ marginBottom: 8 }}>⭐ Article of the Month</div>}
          {openArticle.coverImageURL && <img className="article-cover" src={openArticle.coverImageURL} alt="" />}
          <h2>{openArticle.title}</h2>
          <div className="article-byline">
            by {openArticle.authorName} · {openArticle.category || 'Others'} · {readTime(openArticle.body)} min read · {openArticle.viewCount || 0} views
          </div>

          <div className="job-actions" style={{ margin: '10px 0' }}>
            <button
              className={'btn btn-ghost btn-sm' + (savedOpen ? ' active' : '')}
              onClick={() => toggleBookmark(currentUser.uid, savedOpen, {
                type: 'article',
                itemId: openArticle.id,
                title: openArticle.title,
                snippet: `by ${openArticle.authorName}`,
                imageURL: openArticle.coverImageURL || '',
                link: '/articles',
              })}
            >
              {savedOpen ? '🔖 Saved' : '🔖 Save'}
            </button>
            <button
              className={'btn btn-ghost btn-sm' + (liked ? ' active' : '')}
              onClick={() => toggleLike(openArticle)}
            >
              👍 {openArticle.likes?.length || 0}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShareItem({
                title: openArticle.title,
                snippet: `by ${openArticle.authorName}`,
                link: window.location.href,
              })}
            >
              📤 Share
            </button>
            {openArticle.authorId === currentUser.uid && (
              <button className="btn btn-ghost btn-sm" onClick={() => startEdit(openArticle)}>Edit</button>
            )}
            {(openArticle.authorId === currentUser.uid || isAdmin) && (
              <button className="btn btn-ghost btn-sm" onClick={() => removeArticle(openArticle)}>Delete</button>
            )}
            {isAdmin && (
              openArticle.featured ? (
                <button className="btn btn-ghost btn-sm" onClick={() => unfeature(openArticle)}>Unfeature</button>
              ) : (
                <button className="btn btn-ghost btn-sm" onClick={() => setFeatured(openArticle)}>⭐ Set as Article of the Month</button>
              )
            )}
          </div>

          <div>{renderArticleBody(openArticle.body)}</div>

          <h3 className="settings-subheading" style={{ marginTop: 18 }}>Comments</h3>
          <ArticleComments
            articleId={openArticle.id}
            articleAuthorId={openArticle.authorId}
            currentUser={currentUser}
            currentProfile={currentProfile}
          />
        </div>
        {shareItem && <ShareSheet item={shareItem} onClose={() => setShareItem(null)} />}
      </div>
    );
  }

  // ---------- List view ----------
  return (
    <div className="articles-page">
      <div className="card">
        <button className="btn btn-primary btn-sm" onClick={() => { cancelForm(); setShowForm((v) => !v); }}>
          {showForm ? 'Cancel' : 'Write an article'}
        </button>
        {myDrafts.length > 0 && (
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => setShowDrafts((v) => !v)}>
            {showDrafts ? 'Hide my drafts' : `My drafts (${myDrafts.length})`}
          </button>
        )}
      </div>

      {showForm && (
        <form className="card" onSubmit={(e) => handleSave(e, true)}>
          <div className="form-field">
            <input type="text" placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="form-field">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-field">
            <textarea
              placeholder={'Write your article...\n\nFormatting tips: # Heading, ## Subheading, **bold**, *italic*, - bullet point'}
              rows={10}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </div>
          {coverPreview && <img className="composer-preview-img" src={coverPreview} alt="" />}
          <label className="btn btn-ghost btn-sm">
            Add cover image
            <input type="file" accept="image/*" hidden onChange={handleCoverPick} />
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-ghost btn-block"
              disabled={saving}
              onClick={(e) => handleSave(e, false)}
            >
              {saving ? <span className="spinner" /> : 'Save draft'}
            </button>
            <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
              {saving ? <span className="spinner" /> : (editingId ? 'Update & publish' : 'Publish')}
            </button>
          </div>
        </form>
      )}

      {showDrafts && myDrafts.length > 0 && (
        <div className="card">
          <h3 className="settings-subheading">My drafts</h3>
          {myDrafts.map((d) => (
            <div className="person-row" key={d.id}>
              <div className="person-info">
                <div className="person-name">{d.title || '(untitled)'}</div>
                <div className="person-headline">{d.category}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => startEdit(d)}>Edit</button>
              <button className="btn btn-ghost btn-sm" onClick={() => removeArticle(d)}>Delete</button>
            </div>
          ))}
        </div>
      )}

      {featuredArticle && (
        <div className="card article-card" style={{ border: '2px solid var(--primary, #6d5efc)' }} onClick={() => openArt(featuredArticle)}>
          <div className="badge" style={{ marginBottom: 6 }}>⭐ Article of the Month</div>
          {featuredArticle.coverImageURL && <img className="article-thumb" src={featuredArticle.coverImageURL} alt="" />}
          <div className="article-card-body">
            <div className="article-title">{featuredArticle.title}</div>
            <div className="article-byline">by {featuredArticle.authorName} · {featuredArticle.category}</div>
            <p className="article-excerpt">{featuredArticle.body.slice(0, 140)}{featuredArticle.body.length > 140 ? '…' : ''}</p>
          </div>
        </div>
      )}

      <div className="notifications-toolbar" style={{ flexWrap: 'wrap' }}>
        <button className={'btn btn-sm ' + (categoryFilter === 'all' ? 'btn-primary' : 'btn-ghost')} onClick={() => setCategoryFilter('all')}>All</button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            className={'btn btn-sm ' + (categoryFilter === c ? 'btn-primary' : 'btn-ghost')}
            onClick={() => setCategoryFilter(c)}
          >
            {c}
          </button>
        ))}
      </div>

      {visibleArticles.length === 0 && <div className="empty-state">No articles found.</div>}

      {visibleArticles.map((article) => (
        <div className="card article-card" key={article.id} onClick={() => openArt(article)}>
          {article.coverImageURL && <img className="article-thumb" src={article.coverImageURL} alt="" />}
          <div className="article-card-body">
            <div className="article-title">{article.title}</div>
            <div className="article-byline">
              by {article.authorName} · {article.category || 'Others'} · {readTime(article.body)} min read
            </div>
            <p className="article-excerpt">{article.body.slice(0, 140)}{article.body.length > 140 ? '…' : ''}</p>
            <div className="job-actions">
              <span className="job-applicants">👍 {article.likes?.length || 0} · 👁️ {article.viewCount || 0}</span>
              <button
                className={'btn btn-ghost btn-sm' + (bookmarkIds.has(bookmarkDocId('article', article.id)) ? ' active' : '')}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleBookmark(currentUser.uid, bookmarkIds.has(bookmarkDocId('article', article.id)), {
                    type: 'article',
                    itemId: article.id,
                    title: article.title,
                    snippet: `by ${article.authorName}`,
                    imageURL: article.coverImageURL || '',
                    link: '/articles',
                  });
                }}
              >
                {bookmarkIds.has(bookmarkDocId('article', article.id)) ? '🔖 Saved' : '🔖 Save'}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setShareItem({
                    title: article.title,
                    snippet: `by ${article.authorName}`,
                    link: `${window.location.origin}${window.location.pathname}`,
                  });
                }}
              >
                📤 Share
              </button>
              {article.authorId === currentUser.uid && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={(e) => { e.stopPropagation(); startEdit(article); }}
                >
                  Edit
                </button>
              )}
              {(article.authorId === currentUser.uid || isAdmin) && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={(e) => { e.stopPropagation(); removeArticle(article); }}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      ))}

      {shareItem && <ShareSheet item={shareItem} onClose={() => setShareItem(null)} />}
    </div>
  );
}
