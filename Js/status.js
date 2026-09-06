import { db, auth } from './firebase-init.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export async function postStatus(text) {
    const uid = auth.currentUser.uid;
    await addDoc(collection(db, 'statuses'), {
        type: 'post',
        text: text,
        imageURL: '',
        postedByUid: uid,
        postedByName: auth.currentUser.displayName || 'Member',
        createdAt: serverTimestamp()
    });
}
