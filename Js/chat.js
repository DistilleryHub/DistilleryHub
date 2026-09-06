import { db, auth } from './firebase-init.js';
import { collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// मैसेज भेजना
export async function sendMessage(convoId, text) {
    const uid = auth.currentUser.uid;
    await addDoc(collection(db, 'conversations', convoId, 'messages'), {
        senderUid: uid,
        senderName: auth.currentUser.displayName || 'Member',
        text: text,
        messageType: 'text',
        createdAt: serverTimestamp()
    });
}

// मैसेज पढ़ना (Live)
export function listenMessages(convoId, callback) {
    const q = query(collection(db, 'conversations', convoId, 'messages'), orderBy('createdAt', 'asc'), limit(50));
    return onSnapshot(q, (snapshot) => {
        const msgs = [];
        snapshot.forEach(doc => msgs.push({ id: doc.id, ...doc.data() }));
        callback(msgs);
    });
}
