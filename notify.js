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
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

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
  try {
    await addDoc(collection(db, 'notifications'), {
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
  } catch (err) {
    console.error('notify() failed:', err);
  }
}
