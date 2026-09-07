import { db, auth } from './firebase-init.js';
import { collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// अब यह text, image URL, video URL सब भेज सकता है
export async function sendMessage(convoId, text, imageURL = '') {
    await addDoc(collection(db, 'conversations', convoId, 'messages'), {
        senderUid: auth.currentUser.uid,
        senderName: auth.currentUser.displayName || 'Member',
        text: text,
        imageURL: imageURL,
        createdAt: serverTimestamp()
    });
}

export function listenMessages(convoId, callback) {
    const q = query(collection(db, 'conversations', convoId, 'messages'), orderBy('createdAt', 'asc'), limit(50));
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
}
