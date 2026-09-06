import { auth } from './firebase-init.js';

export async function startCall(otherUid, type) {
    if (!auth.currentUser) { alert('Please login first'); return; }
    if (!navigator.mediaDevices) { alert('Calling not supported'); return; }
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
        alert('Call started (Mic/Camera accessed)');
        return { stream }; // अभी सिर्फ यही काम करेगा
    } catch (err) {
        alert('Camera/Mic permission denied');
        return;
    }
}
