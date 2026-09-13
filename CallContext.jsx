import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import {
  doc, collection, addDoc, updateDoc, deleteDoc, onSnapshot, query, where,
  serverTimestamp, arrayRemove, getDoc, orderBy,
} from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './AuthContext';
import { startRingback, startRingtone } from './callSounds';

const CallContext = createContext(null);
export function useCall() { return useContext(CallContext); }

// Explicit audio constraints — don't rely on the browser/WebView's default,
// since defaults vary across devices and inside a Play Store TWA wrapper.
// This is on top of the double-audio-playback fix in CallScreen.jsx.
const AUDIO_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
};

export function CallProvider({ children }) {
  const { currentUser } = useAuth();
  const [activeCall, setActiveCall] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [localStream, setLocalStream] = useState(null);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [facingMode, setFacingMode] = useState('user'); // 'user' = front, 'environment' = back

  const peersRef = useRef({});
  const localStreamRef = useRef(null);
  const unsubSignalsRef = useRef(null);
  const activeCallRef = useRef(null);
  const pendingCandidatesRef = useRef({}); // peerUid -> [candidate, ...] queued until remoteDescription is set
  const ringbackStopRef = useRef(null);
  const ringtoneStopRef = useRef(null);

  useEffect(() => { activeCallRef.current = activeCall; }, [activeCall]);

  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, 'calls'), where('participants', 'array-contains', currentUser.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        snap.docChanges().forEach((change) => {
          const data = { id: change.doc.id, ...change.doc.data() };

          // Naya incoming call — ringtone bajao (sirf jinhone call start nahi ki unke liye)
          if (change.type === 'added' && data.status === 'ringing' && data.initiatedBy !== currentUser.uid) {
            setIncomingCall(data);
            if (!ringtoneStopRef.current) {
              ringtoneStopRef.current = startRingtone();
            }
          }

          // Doosre banda ne call accept kar li -> caller ki ringback band karo, UI active pe switch karo
          if (change.type === 'modified' && activeCallRef.current?.id === data.id && data.status === 'active') {
            setActiveCall((prev) => (prev ? { ...prev, status: 'active' } : prev));
            if (ringbackStopRef.current) { ringbackStopRef.current(); ringbackStopRef.current = null; }
          }

          // Call khatam ho gayi (decline / hangup / dono me se koi bhi)
          if (data.status === 'ended') {
            if (activeCallRef.current?.id === data.id) {
              endCallCleanup();
            }
            setIncomingCall((prev) => {
              if (prev && prev.id === data.id) {
                if (ringtoneStopRef.current) { ringtoneStopRef.current(); ringtoneStopRef.current = null; }
                return null;
              }
              return prev;
            });
          }
        });
      },
      (error) => {
        // Agar ye silently fail ho (e.g. missing Firestore index / rules issue),
        // koi bhi incoming call kabhi nahi dikhegi. Ab console me clear error aayega.
        console.error('DistilleryHub: calls listener failed', error);
      }
    );
    return unsub;
  }, [currentUser]);

  function queueCandidate(peerUid, candidate) {
    if (!pendingCandidatesRef.current[peerUid]) pendingCandidatesRef.current[peerUid] = [];
    pendingCandidatesRef.current[peerUid].push(candidate);
  }

  async function flushQueuedCandidates(peerUid, pc) {
    const queued = pendingCandidatesRef.current[peerUid];
    if (!queued || queued.length === 0) return;
    pendingCandidatesRef.current[peerUid] = [];
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error('DistilleryHub call: failed to add queued ICE candidate', e);
      }
    }
  }

  function createPeerConnection(peerUid, callId) {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    localStreamRef.current?.getTracks().forEach((track) => {
      pc.addTrack(track, localStreamRef.current);
    });

    pc.ontrack = (event) => {
      setRemoteStreams((prev) => ({ ...prev, [peerUid]: event.streams[0] }));
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        addDoc(collection(db, 'calls', callId, 'signals'), {
          from: currentUser.uid,
          to: peerUid,
          kind: 'candidate',
          payload: JSON.stringify(event.candidate),
          createdAt: serverTimestamp(),
        }).catch((e) => console.error('DistilleryHub call: failed to send ICE candidate', e));
      }
    };

    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
        setRemoteStreams((prev) => {
          const next = { ...prev };
          delete next[peerUid];
          return next;
        });
      }
    };

    peersRef.current[peerUid] = pc;
    return pc;
  }

  async function connectToPeer(peerUid, callId, callType) {
    // IMPORTANT: reuse an existing connection for this peer if one already
    // exists. An incoming offer (handled in listenForSignals, which starts
    // listening before this runs) can create the peer connection first —
    // if we always created a brand-new one here, we'd silently replace an
    // already-negotiating/connected PeerConnection with a fresh, empty one
    // that never receives a remote description. That's what caused remote
    // video (and sometimes audio) to never show up on one side of the call.
    const pc = peersRef.current[peerUid] || createPeerConnection(peerUid, callId);
    const initiate = currentUser.uid < peerUid;
    if (initiate) {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: callType === 'video',
      });
      await pc.setLocalDescription(offer);
      await addDoc(collection(db, 'calls', callId, 'signals'), {
        from: currentUser.uid,
        to: peerUid,
        kind: 'offer',
        payload: JSON.stringify(offer),
        createdAt: serverTimestamp(),
      });
    }
  }

  function listenForSignals(callId) {
    const q = query(
      collection(db, 'calls', callId, 'signals'),
      where('to', '==', currentUser.uid),
      orderBy('createdAt', 'asc')
    );
    return onSnapshot(
      q,
      (snap) => {
        snap.docChanges().forEach(async (change) => {
          if (change.type !== 'added') return;
          const sig = change.doc.data();
          const from = sig.from;
          let pc = peersRef.current[from];
          if (!pc) pc = createPeerConnection(from, callId);

          const payload = JSON.parse(sig.payload);

          try {
            if (sig.kind === 'offer') {
              await pc.setRemoteDescription(new RTCSessionDescription(payload));
              await flushQueuedCandidates(from, pc);
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              await addDoc(collection(db, 'calls', callId, 'signals'), {
                from: currentUser.uid,
                to: from,
                kind: 'answer',
                payload: JSON.stringify(answer),
                createdAt: serverTimestamp(),
              });
            } else if (sig.kind === 'answer') {
              await pc.setRemoteDescription(new RTCSessionDescription(payload));
              await flushQueuedCandidates(from, pc);
            } else if (sig.kind === 'candidate') {
              // Agar remote description abhi set nahi hui, candidate ko queue me daalo —
              // pehle ye silently drop/fail ho jata tha aur connection kabhi bijli nahi banti thi.
              if (pc.remoteDescription && pc.remoteDescription.type) {
                await pc.addIceCandidate(new RTCIceCandidate(payload));
              } else {
                queueCandidate(from, payload);
              }
            }
          } catch (e) {
            console.error('DistilleryHub call: signal handling failed', sig.kind, e);
          }

          deleteDoc(change.doc.ref).catch(() => {});
        });
      },
      (error) => {
        // CRITICAL: is query ko 'to' (where) + 'createdAt' (orderBy) chahiye —
        // Firestore ko iske liye composite index chahiye hota hai. Agar wo
        // index nahi hai, ye query yahan tak pehle silently fail ho jaati
        // thi — offer/answer/ICE candidates kabhi exchange hi nahi hote the,
        // isliye dono taraf sirf apna khud ka local video dikhta tha, remote
        // ka na video aata tha na audio.
        //
        // Ab error console me clearly dikhega. Agar index missing hai,
        // Firebase khud ek clickable link degi jisse 1 click me index ban
        // jaayega (Firebase Console > Firestore > Indexes me bhi manually
        // bana sakte ho: collection 'signals', fields 'to' Asc + 'createdAt' Asc).
        console.error('DistilleryHub: signal listener failed for call', callId, error);
      }
    );
  }

  const startCall = useCallback(async (participantUids, callType = 'video') => {
    if (!currentUser) return;
    const allParticipants = [...new Set([currentUser.uid, ...participantUids])];
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: AUDIO_CONSTRAINTS,
      video: callType === 'video' ? { facingMode } : false,
    });
    localStreamRef.current = stream;
    setLocalStream(stream);

    const callRef = await addDoc(collection(db, 'calls'), {
      participants: allParticipants,
      initiatedBy: currentUser.uid,
      callType,
      status: 'ringing',
      createdAt: serverTimestamp(),
    });

    // status 'ringing' pe rehta hai jab tak doosra accept na kare (joinCall me 'active' hota hai)
    setActiveCall({ id: callRef.id, callType, participants: allParticipants, status: 'ringing' });
    ringbackStopRef.current = startRingback();

    unsubSignalsRef.current = listenForSignals(callRef.id);

    for (const uid of allParticipants) {
      if (uid !== currentUser.uid) await connectToPeer(uid, callRef.id, callType);
    }
  }, [currentUser, facingMode]);

  const joinCall = useCallback(async (call) => {
    if (ringtoneStopRef.current) { ringtoneStopRef.current(); ringtoneStopRef.current = null; }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: AUDIO_CONSTRAINTS,
      video: call.callType === 'video' ? { facingMode } : false,
    });
    localStreamRef.current = stream;
    setLocalStream(stream);
    setIncomingCall(null);
    setActiveCall({ id: call.id, callType: call.callType, participants: call.participants, status: 'active' });

    unsubSignalsRef.current = listenForSignals(call.id);

    for (const uid of call.participants) {
      if (uid !== currentUser.uid) await connectToPeer(uid, call.id, call.callType);
    }

    // Caller ko batao ki call accept ho gayi — iske baad hi ringback rukegi
    await updateDoc(doc(db, 'calls', call.id), { status: 'active' }).catch(() => {});
  }, [currentUser, facingMode]);

  function endCallCleanup() {
    Object.values(peersRef.current).forEach((pc) => pc.close());
    peersRef.current = {};
    pendingCandidatesRef.current = {};
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStreams({});
    setActiveCall(null);
    setMuted(false);
    setVideoOff(false);
    setFacingMode('user');
    if (unsubSignalsRef.current) { unsubSignalsRef.current(); unsubSignalsRef.current = null; }
    if (ringbackStopRef.current) { ringbackStopRef.current(); ringbackStopRef.current = null; }
    if (ringtoneStopRef.current) { ringtoneStopRef.current(); ringtoneStopRef.current = null; }
  }

  const leaveCall = useCallback(async () => {
    if (!activeCall) return;
    const callRef = doc(db, 'calls', activeCall.id);
    const snap = await getDoc(callRef);
    if (snap.exists()) {
      const remaining = (snap.data().participants || []).filter((u) => u !== currentUser.uid);
      if (remaining.length <= 1) {
        await updateDoc(callRef, { status: 'ended' });
      } else {
        await updateDoc(callRef, { participants: arrayRemove(currentUser.uid) });
      }
    }
    endCallCleanup();
  }, [activeCall, currentUser]);

  const declineCall = useCallback(async () => {
    if (!incomingCall) return;
    if (ringtoneStopRef.current) { ringtoneStopRef.current(); ringtoneStopRef.current = null; }
    try {
      const callRef = doc(db, 'calls', incomingCall.id);
      const snap = await getDoc(callRef);
      if (snap.exists()) {
        const remaining = (snap.data().participants || []).filter((u) => u !== currentUser.uid);
        if (remaining.length <= 1) {
          await updateDoc(callRef, { status: 'ended' });
        } else {
          await updateDoc(callRef, { participants: arrayRemove(currentUser.uid) });
        }
      }
    } catch (e) {
      console.error('DistilleryHub call: decline failed', e);
    }
    setIncomingCall(null);
  }, [incomingCall, currentUser]);

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const next = !muted;
    localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  }, [muted]);

  const toggleVideo = useCallback(() => {
    if (!localStreamRef.current) return;
    const next = !videoOff;
    localStreamRef.current.getVideoTracks().forEach((t) => (t.enabled = !next));
    setVideoOff(next);
  }, [videoOff]);

  const switchCamera = useCallback(async () => {
    if (!localStreamRef.current) return;
    const nextFacing = facingMode === 'user' ? 'environment' : 'user';
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: nextFacing },
        audio: false,
      });
      const newVideoTrack = newStream.getVideoTracks()[0];
      if (!newVideoTrack) return;

      const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];
      if (oldVideoTrack) {
        localStreamRef.current.removeTrack(oldVideoTrack);
        oldVideoTrack.stop();
      }
      localStreamRef.current.addTrack(newVideoTrack);
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));

      Object.values(peersRef.current).forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (sender) sender.replaceTrack(newVideoTrack);
      });

      setFacingMode(nextFacing);
    } catch (e) {
      // Device me ek hi camera ho sakta hai — chup chaap fail, current camera chalta rahega.
    }
  }, [facingMode]);

  return (
    <CallContext.Provider value={{
      activeCall, remoteStreams, localStream, muted, videoOff, incomingCall, facingMode,
      startCall, joinCall, leaveCall, declineCall, toggleMute, toggleVideo, switchCamera,
    }}>
      {children}
    </CallContext.Provider>
  );
}
