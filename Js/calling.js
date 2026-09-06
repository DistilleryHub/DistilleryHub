import { db, auth, RTC_CONFIG } from './firebase-init.js';
import { collection, doc, addDoc, setDoc, updateDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export async function startCall(otherUid, type) {
    if (!navigator.mediaDevices) { alert('Calling not supported'); return; }
    if (!auth.currentUser) { alert('Please login first'); return; }

    let localStream;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
    } catch (err) {
        alert('Camera/Mic permission denied');
        return;
    }

    const callId = doc(collection(db, 'calls')).id;
    const callRef = doc(db, 'calls', callId);

    // Call document create karo
    await setDoc(callRef, {
        callerUid: auth.currentUser.uid,
        calleeUid: otherUid,
        type: type,
        status: 'ringing',
        createdAt: serverTimestamp()
    });

    const pc = new RTCPeerConnection(RTC_CONFIG);
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    // Offer create karo
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await updateDoc(callRef, { offer: { type: offer.type, sdp: offer.sdp } });

    // ICE candidates bhejo
    pc.onicecandidate = (e) => {
        if (e.candidate) {
            addDoc(collection(db, 'calls', callId, 'callerCandidates'), e.candidate.toJSON());
        }
    };

    // Answer suno
    onSnapshot(callRef, async (snap) => {
        const data = snap.data();
        if (data && data.status === 'accepted' && data.answer && pc.signalingState !== 'stable') {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
        if (data && data.status === 'ended') {
            localStream.getTracks().forEach(t => t.stop());
            pc.close();
            alert('Call ended');
        }
    });

    // Callee candidates suno
    onSnapshot(collection(db, 'calls', callId, 'calleeCandidates'), (snap) => {
        snap.docChanges().forEach(change => {
            if (change.type === 'added') {
                pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
            }
        });
    });

    return { pc, localStream, callId };
}
