// notify.js
//
// One shared place to create a notification. Every feature (Feed, Jobs,
// Market, Network, Groups, Chat, ...) calls notify() instead of writing to
// the `notifications` collection directly. That keeps every notification in
// the same shape so:
//   - Notifications.jsx can always show n.message + a working "View" link
//   - the Cloud Function (functions/index.js) always has n.type (to respect
//     the recipient's Settings toggles) and n.message (exact push text)
//   - tapping a notification always opens the right screen via n.link
//
// Adding notifications for a brand-new feature later is just:
//
//   import { notify } from './notify';
//   await notify({
//     toUserId: otherPersonsUid,
//     type: 'like',                     // short category — used for prefs
//     message: `${name} liked your post`, // exact text (in-app + push)
//     link: '/some/route',              // where tapping it should go
//     fromUserId: currentUser.uid,
//     fromUserName: currentProfile?.name,
//     fromUserPhoto: currentProfile?.photoURL,
//   });
//
import { addDoc, collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db, auth } from './firebase';

export async function notify({
  toUserId,
  type = 'general',
  message,
  link = '',
  fromUserId = '',
  fromUserName = '',
  fromUserPhoto = '',
  extra = {},
}) {
  if (!toUserId) return;
  if (fromUserId && toUserId === fromUserId) return; // never notify yourself
  const senderUid = auth.currentUser?.uid;
  if (!senderUid) return; // must be signed in — matches firestore.rules
  try {
    // Batched with the rate-limit stamp (firestore.rules requires both to
    // land in the same commit — see rateLimitsNotifications above it) so a
    // signed-in user can't spam another user with unlimited notifications.
    const batch = writeBatch(db);
    const notifRef = doc(collection(db, 'notifications'));
    batch.set(notifRef, {
      toUserId,
      type,
      message,
      link,
      fromUserId,
      fromUserName,
      fromUserPhoto,
      read: false,
      createdAt: serverTimestamp(),
      ...extra,
    });
    batch.set(doc(db, 'rateLimitsNotifications', senderUid), { lastNotifAt: serverTimestamp() }, { merge: true });
    await batch.commit();
  } catch (err) {
    console.error('notify() failed:', err);
  }
}
