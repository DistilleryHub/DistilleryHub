import { db, auth } from './firebase-init.js';
import { collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export async function postText(text, imageURL = '') {
    const uid = auth.currentUser.uid;
    await addDoc(collection(db, 'posts'), {
        authorUid: uid,
        authorName: auth.currentUser.displayName || 'Member',
        text: text,
        imageURL: imageURL,  // अब फोटो भी save होगी
        likes: [],
        createdAt: serverTimestamp()
    });
}

export function listenFeed(callback) {
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(20));
    return onSnapshot(q, (snapshot) => {
        const posts = [];
        snapshot.forEach(doc => posts.push({ id: doc.id, ...doc.data() }));
        callback(posts);
    });
}
