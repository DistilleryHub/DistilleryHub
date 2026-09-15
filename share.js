import { collection, addDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { notify } from './notify';

export function chatIdFor(uidA, uidB) {
  return [uidA, uidB].sort().join('_');
}

// Sends a shared post/article as a direct-chat message to a specific
// connection — creates the chat doc if it doesn't exist yet (same pattern
// Chat.jsx itself uses for a fresh direct chat).
export async function shareToConnection(currentUser, currentProfile, targetUid, text) {
  const chatId = chatIdFor(currentUser.uid, targetUid);
  await setDoc(doc(db, 'chats', chatId), {
    type: 'direct',
    participants: [currentUser.uid, targetUid].sort(),
    lastMessage: text,
    lastMessageAt: serverTimestamp(),
  }, { merge: true });
  await addDoc(collection(db, 'chats', chatId, 'messages'), {
    senderId: currentUser.uid,
    text,
    createdAt: serverTimestamp(),
    readBy: [],
    reactions: {},
    deletedFor: [],
  });
  // So the recipient gets a push/in-app alert even if they don't have
  // Chat open — mirrors how every other feature notifies the other side.
  await notify({
    toUserId: targetUid,
    type: 'message',
    message: `${currentProfile?.name || 'Someone'} shared something with you`,
    link: '/chat',
    fromUserId: currentUser.uid,
    fromUserName: currentProfile?.name || 'Member',
    fromUserPhoto: currentProfile?.photoURL || '',
  });
}

// Native OS share sheet (WhatsApp/Instagram/etc). Falls back to copying
// a text+link blob to the clipboard on browsers without Web Share support
// (mainly desktop Chrome/Firefox).
export async function nativeShare({ title, text, url }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (err) {
      if (err.name === 'AbortError') return 'cancelled';
      throw err;
    }
  }
  await navigator.clipboard.writeText(url ? `${text}\n${url}` : text);
  return 'copied';
}
