import { db, auth } from './firebase-init.js';
import { collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export async function postText(text, imageURL = '') {
    try {
        await addDoc(collection(db, 'posts'), {
            authorUid: auth.currentUser.uid,
            authorName: auth.currentUser.displayName || 'Member',
            text: text,
            imageURL: imageURL,
            likes: [],
            createdAt: serverTimestamp()
        });
        return { success: true };
    } catch (error) {
        throw new Error(error.message); // असली error बाहर भेजो
    }
}

export function listenFeed(callback) {
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(20));
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
}
