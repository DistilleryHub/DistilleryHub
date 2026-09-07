import { db, auth } from './firebase-init.js';
import { collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// मैसेज भेजना (अब text या image URL)
export async function sendMessage(convoId, text, imageURL = '', videoURL = '') {
    await addDoc(collection(db, 'conversations', convoId, 'messages'), {
        senderUid: auth.currentUser.uid,
        senderName: auth.currentUser.displayName || 'Member',
        text: text,
        imageURL: imageURL,
        videoURL: videoURL,
        messageType: imageURL ? 'image' : (videoURL ? 'video' : 'text'),
        createdAt: serverTimestamp()
    });
}

// मैसेज पढ़ना (Live)
export function listenMessages(convoId, callback) {
    const q = query(collection(db, 'conversations', convoId, 'messages'), orderBy('createdAt', 'asc'), limit(50));
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
}
