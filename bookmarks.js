import { doc, setDoc, deleteDoc, serverTimestamp, collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';

// Deterministic doc ID so save/unsave never creates duplicates and doesn't
// need an extra query just to check "is this already saved".
export function bookmarkDocId(type, itemId) {
  return `${type}_${itemId}`;
}

// item: { type: 'post' | 'job' | 'article', itemId, title, snippet, imageURL, link }
export async function toggleBookmark(uid, isBookmarked, item) {
  const ref = doc(db, 'users', uid, 'bookmarks', bookmarkDocId(item.type, item.itemId));
  if (isBookmarked) {
    await deleteDoc(ref);
  } else {
    await setDoc(ref, {
      type: item.type,
      itemId: item.itemId,
      title: item.title || '',
      snippet: item.snippet || '',
      imageURL: item.imageURL || '',
      link: item.link || '/',
      createdAt: serverTimestamp(),
    });
  }
}

export function listenBookmarks(uid, onChange) {
  const q = query(collection(db, 'users', uid, 'bookmarks'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}
