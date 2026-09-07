import { db, auth, RTC_CONFIG } from './firebase-init.js';
import { collection, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export async function startCall(otherUid, type) {
    if (!auth.currentUser) { alert('Please login first'); return; }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
        const callRef = doc(collection(db, 'calls'));
        await setDoc(callRef, {
            callerUid: auth.currentUser.uid,
            calleeUid: otherUid,
            type: type,
            status: 'ringing',
            createdAt: serverTimestamp()
        });
        alert('Call started...');
        return { stream, callId: callRef.id };
    } catch (err) {
        alert('Camera/Mic permission denied');
        return;
    }
}
