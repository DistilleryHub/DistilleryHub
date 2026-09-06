import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyB63lPTtic1RUjfq-KXWrvtisSGIetXL6k",
    authDomain: "distilleryhub-b1d2d.firebaseapp.com",
    projectId: "distilleryhub-b1d2d",
    storageBucket: "distilleryhub-b1d2d.firebasestorage.app",
    messagingSenderId: "221084904588",
    appId: "1:221084904588:web:f1c47a722b2a7c98509fa9"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const RTC_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' }
    ]
};
export async function startCall(otherUid, type) {
    if (!navigator.mediaDevices) { alert('Calling not supported'); return; }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
        const pc = new RTCPeerConnection(RTC_CONFIG);
        stream.getTracks().forEach(track => pc.addTrack(track, stream));
        return { pc, stream };
    } catch (err) { alert('Camera/Mic permission denied'); }
}
