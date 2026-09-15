import {
  doc, collection, query, where, onSnapshot,
  writeBatch, increment, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

// Deterministic doc ID so follow/unfollow never creates duplicates and
// checking "am I following this person" is a single doc read, not a query.
export function followDocId(followerId, followedId) {
  return `${followerId}_${followedId}`;
}

// One-way follow (LinkedIn-style) — separate from the mutual accept/reject
// Connect flow in Network.jsx/Profile.jsx. Denormalizes followerCount /
// followingCount onto the two users' docs in the same batch so profile
// counts stay correct without needing a Cloud Function trigger (project is
// still on the Spark plan).
export async function followUser(followerId, followedId) {
  if (!followerId || !followedId || followerId === followedId) return;
  const batch = writeBatch(db);
  batch.set(doc(db, 'follows', followDocId(followerId, followedId)), {
    followerId,
    followedId,
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, 'users', followedId), { followerCount: increment(1) });
  batch.update(doc(db, 'users', followerId), { followingCount: increment(1) });
  await batch.commit();
}

export async function unfollowUser(followerId, followedId) {
  if (!followerId || !followedId) return;
  const batch = writeBatch(db);
  batch.delete(doc(db, 'follows', followDocId(followerId, followedId)));
  batch.update(doc(db, 'users', followedId), { followerCount: increment(-1) });
  batch.update(doc(db, 'users', followerId), { followingCount: increment(-1) });
  await batch.commit();
}

// Live "who does this user follow" as a Set of followed UIDs — used to show
// Follow/Following on every card in a list (Feed, Network) with one listener
// instead of one per person.
export function listenMyFollowing(uid, onChange) {
  if (!uid) return () => {};
  const q = query(collection(db, 'follows'), where('followerId', '==', uid));
  return onSnapshot(q, (snap) => {
    onChange(new Set(snap.docs.map((d) => d.data().followedId)));
  });
}

// Live "does A follow B" — used on a single profile page.
export function listenIsFollowing(followerId, followedId, onChange) {
  if (!followerId || !followedId) return () => {};
  return onSnapshot(doc(db, 'follows', followDocId(followerId, followedId)), (snap) => {
    onChange(snap.exists());
  });
}
