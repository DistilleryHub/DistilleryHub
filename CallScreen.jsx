import { useEffect, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './AuthContext';
import { useCall } from './CallContext';
import { getSharedAudioContext } from './callSounds';
import { IconMic, IconMicOff, IconVolume, IconVolumeMute, IconVideo, IconVideoOff, IconRefreshCw, IconPhone } from './Icons';

const profileCache = {};

function useUserProfile(uid) {
  const [profile, setProfile] = useState(profileCache[uid] || null);
  useEffect(() => {
    if (!uid) return;
    if (profileCache[uid]) { setProfile(profileCache[uid]); return; }
    let cancelled = false;
    getDoc(doc(db, 'users', uid)).then((snap) => {
      if (cancelled) return;
      const data = snap.exists() ? snap.data() : {};
      profileCache[uid] = data;
      setProfile(data);
    });
    return () => { cancelled = true; };
  }, [uid]);
  return profile || {};
}

function Avatar({ profile, size = 96 }) {
  const initial = profile?.name?.[0]?.toUpperCase() || '?';
  return profile?.photoURL ? (
    <img
      src={profile.photoURL}
      alt=""
      className="call-avatar"
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }}
    />
  ) : (
    <div className="call-avatar call-avatar-fallback" style={{ width: size, height: size, borderRadius: '50%' }}>
      {initial}
    </div>
  );
}

function CallTimer({ startedAt }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  return <span className="call-timer">{mm}:{ss}</span>;
}

const QUALITY_STYLES = {
  Excellent: { color: 'var(--success)' },
  Good: { color: 'var(--warning)' },
  Poor: { color: 'var(--danger)' },
  Reconnecting: { color: 'var(--danger)' },
};

function QualityBadge({ stats }) {
  const quality = stats?.quality;
  if (!quality) return null;
  const style = QUALITY_STYLES[quality] || QUALITY_STYLES.Good;
  const detail = [
    stats.rtt != null ? `${Math.round(stats.rtt * 1000)}ms` : null,
    stats.packetLossPct != null ? `${stats.packetLossPct.toFixed(1)}% loss` : null,
  ].filter(Boolean).join(' · ');
  return (
    <span
      className="call-quality-badge"
      title={detail || undefined}
      style={{ color: style.color, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}
    >
      <span style={{
        width: 7, height: 7, borderRadius: '50%', background: style.color, display: 'inline-block',
        animation: quality === 'Reconnecting' ? 'pulse 1s ease-in-out infinite' : 'none',
      }} />
      {quality}
    </span>
  );
}

// Detects whether a MediaStream currently has audible sound, using the Web
// Audio API's analyser node. Used to draw the "active speaker" highlight
// ring around a tile in group calls. Threshold is tuned for normal speech
// volume — background noise shouldn't trigger it, but this may need small
// adjustment once tested on real devices.
function useIsSpeaking(stream) {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) {
      setSpeaking(false);
      return;
    }
    let raf = null;
    let source = null;
    let analyser = null;
    let cancelled = false;

    try {
      const ctx = getSharedAudioContext();
      source = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        if (cancelled) return;
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length;
        setSpeaking(avg > 14);
        raf = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      // Analyser unsupported / stream not ready yet — just skip the highlight.
    }

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      try { source && source.disconnect(); } catch (e) { /* ignore */ }
      try { analyser && analyser.disconnect(); } catch (e) { /* ignore */ }
    };
  }, [stream]);
  return speaking;
}

// Best-effort speaker/earpiece routing via setSinkId. Support varies a lot
// by browser/OS (works on most desktop Chrome/Edge and some Android Chrome
// versions; not available on iOS Safari at all) — this silently no-ops
// where unsupported rather than breaking the call.
async function applySinkId(audioEl, speakerOn) {
  if (!audioEl || typeof audioEl.setSinkId !== 'function') return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outputs = devices.filter((d) => d.kind === 'audiooutput');
    if (speakerOn) {
      const speaker = outputs.find((d) => /speaker/i.test(d.label)) || outputs[0];
      if (speaker) await audioEl.setSinkId(speaker.deviceId);
    } else {
      const earpiece = outputs.find((d) => /earpiece|receiver/i.test(d.label));
      await audioEl.setSinkId(earpiece ? earpiece.deviceId : 'default');
    }
  } catch (e) {
    // Not supported, or output-device permission not granted — ignore.
  }
}

// ---------------------------------------------------------------------
// Shared bottom control bar — used by outgoing, 1-on-1, and group screens.
// ---------------------------------------------------------------------
function CallControlsBar({
  isVideoCall, muted, videoOff, speakerOn,
  onToggleMute, onToggleVideo, onSwitchCamera, onToggleSpeaker, onEnd, endLabel,
}) {
  return (
    <div className="call-active-controls">
      <button className={'call-control-btn' + (muted ? ' active' : '')} onClick={onToggleMute} aria-label="Toggle mute">
        {muted ? <IconMicOff className="w-5 h-5" /> : <IconMic className="w-5 h-5" />}
      </button>

      <button className={'call-control-btn' + (speakerOn ? ' active' : '')} onClick={onToggleSpeaker} aria-label="Toggle speaker">
        {speakerOn ? <IconVolume className="w-5 h-5" /> : <IconVolumeMute className="w-5 h-5" />}
      </button>

      {isVideoCall && (
        <button className={'call-control-btn' + (videoOff ? ' active' : '')} onClick={onToggleVideo} aria-label="Toggle camera">
          {videoOff ? <IconVideoOff className="w-5 h-5" /> : <IconVideo className="w-5 h-5" />}
        </button>
      )}

      {isVideoCall && (
        <button className="call-control-btn" onClick={onSwitchCamera} aria-label="Switch front/back camera">
          <IconRefreshCw className="w-5 h-5" />
        </button>
      )}

      <button className="call-btn call-btn-decline call-btn-end" onClick={onEnd} aria-label={endLabel || 'End call'}>
        <span><IconPhone className="w-6 h-6" /></span>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------
// Incoming call — full-screen ringing UI (callee's side)
// ---------------------------------------------------------------------
function IncomingCallOverlay({ call, onAccept, onDecline }) {
  const { currentUser } = useAuth();
  const otherUid = (call.participants || []).find((u) => u !== currentUser.uid);
  const profile = useUserProfile(otherUid);
  const extraCount = (call.participants || []).length - 2; // -1 self, -1 shown caller

  return (
    <div className="call-overlay call-overlay-incoming">
      <div className="call-incoming-top">
        <span className="call-type-label">
          {call.callType === 'video' ? 'Incoming video call' : 'Incoming voice call'}
        </span>
      </div>
      <div className="call-incoming-center">
        <Avatar profile={profile} size={140} />
        <h2 className="call-caller-name">
          {profile.name || 'DistilleryHub member'}
          {extraCount > 0 ? ` +${extraCount} more` : ''}
        </h2>
        <p className="call-ringing-text">is calling…</p>
      </div>
      <div className="call-incoming-actions">
        <button className="call-btn call-btn-decline" onClick={onDecline} aria-label="Decline call"><span><IconPhone className="w-6 h-6" /></span></button>
        <button className="call-btn call-btn-accept" onClick={onAccept} aria-label="Accept call"><span><IconPhone className="w-6 h-6" /></span></button>
      </div>
      <div className="call-incoming-labels">
        <span>Decline</span>
        <span>Accept</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Outgoing call — "Calling…" screen (caller's side, before pickup)
// ---------------------------------------------------------------------
function OutgoingCallOverlay({ call, localStream, muted, videoOff, speakerOn, onLeave, onToggleMute, onToggleVideo, onSwitchCamera, onToggleSpeaker }) {
  const { currentUser } = useAuth();
  const otherUids = (call.participants || []).filter((u) => u !== currentUser.uid);
  const profile = useUserProfile(otherUids[0]);
  const localVideoRef = useRef(null);
  const isVideoCall = call.callType === 'video';
  const isGroup = otherUids.length > 1;

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream || null;
  }, [localStream]);

  return (
    <div className="call-overlay call-overlay-outgoing">
      {isVideoCall && localStream ? (
        <video ref={localVideoRef} className={'call-remote-video' + (videoOff ? ' call-local-video-off' : '')} autoPlay playsInline muted />
      ) : (
        <div className="call-remote-audio-bg"><Avatar profile={profile} size={140} /></div>
      )}

      <div className="call-incoming-top">
        <span className="call-type-label">{isVideoCall ? 'Video calling…' : 'Calling…'}</span>
      </div>
      <div className="call-active-header">
        <h2 className="call-caller-name">
          {isGroup ? `${profile.name || 'Member'} +${otherUids.length - 1} more` : (profile.name || 'DistilleryHub member')}
        </h2>
        <p className="call-ringing-text">Ringing…</p>
      </div>

      <CallControlsBar
        isVideoCall={isVideoCall}
        muted={muted}
        videoOff={videoOff}
        speakerOn={speakerOn}
        onToggleMute={onToggleMute}
        onToggleVideo={onToggleVideo}
        onSwitchCamera={onSwitchCamera}
        onToggleSpeaker={onToggleSpeaker}
        onEnd={onLeave}
        endLabel="Cancel call"
      />
    </div>
  );
}

// ---------------------------------------------------------------------
// 1-on-1 active call — full remote video + local PiP (tap PiP to swap)
// ---------------------------------------------------------------------
function OneOnOneActiveLayout({
  call, otherUid, remoteStreams, localStream, muted, videoOff, speakerOn, callStats,
  onLeave, onToggleMute, onToggleVideo, onSwitchCamera, onToggleSpeaker,
}) {
  const profile = useUserProfile(otherUid);
  const remoteStream = remoteStreams[otherUid];

  const bigVideoRef = useRef(null);
  const pipVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const [startedAt] = useState(() => Date.now());
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [pipIsLocal, setPipIsLocal] = useState(true); // true = local video is the small PiP (default)

  const isVideoCall = call.callType === 'video';
  const remoteHasVideo = isVideoCall && !!remoteStream && remoteStream.getVideoTracks().length > 0;

  const bigStream = pipIsLocal ? remoteStream : localStream;
  const pipStream = pipIsLocal ? localStream : remoteStream;

  useEffect(() => {
    if (bigVideoRef.current) bigVideoRef.current.srcObject = bigStream || null;
  }, [bigStream]);

  useEffect(() => {
    if (pipVideoRef.current) pipVideoRef.current.srcObject = pipStream || null;
  }, [pipStream]);

  // Remote audio always plays through this dedicated element, independent of
  // which video (big or PiP) is currently showing the remote feed. Both video
  // elements are kept muted="muted" (regardless of local/remote) on purpose —
  // unmuting whichever one shows the remote feed used to play the same audio
  // track a second time in parallel, which is what caused the garbled/robotic
  // "double voice" during calls.
  useEffect(() => {
    if (!remoteAudioRef.current) return;
    remoteAudioRef.current.srcObject = remoteStream || null;
    if (remoteStream) {
      const p = remoteAudioRef.current.play();
      if (p && p.then) p.then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true));
    }
  }, [remoteStream]);

  useEffect(() => {
    applySinkId(remoteAudioRef.current, speakerOn);
  }, [speakerOn, remoteStream]);

  const bigIsRemote = pipIsLocal;
  const showBigVideo = isVideoCall && (bigIsRemote ? remoteHasVideo : !!localStream);

  return (
    <div className="call-overlay call-overlay-active">
      <audio ref={remoteAudioRef} autoPlay />

      {audioBlocked && (
        <button
          className="call-audio-unblock-btn"
          onClick={() => { remoteAudioRef.current?.play().then(() => setAudioBlocked(false)).catch(() => {}); }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <IconVolume className="w-4 h-4" /> Tap to enable sound
        </button>
      )}

      {showBigVideo ? (
        <video ref={bigVideoRef} className="call-remote-video" autoPlay playsInline muted />
      ) : (
        <div className="call-remote-audio-bg"><Avatar profile={profile} size={140} /></div>
      )}

      <div className="call-active-header">
        <h2 className="call-caller-name">{profile.name || 'DistilleryHub member'}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CallTimer startedAt={startedAt} />
          <QualityBadge stats={callStats?.[otherUid]} />
        </div>
      </div>

      {isVideoCall && pipStream && (
        <button
          className={'call-local-video-wrap' + (pipIsLocal && videoOff ? ' call-local-video-off' : '')}
          onClick={() => setPipIsLocal((v) => !v)}
          aria-label="Swap main and picture-in-picture video"
        >
          <video ref={pipVideoRef} className="call-local-video" autoPlay playsInline muted />
        </button>
      )}

      <CallControlsBar
        isVideoCall={isVideoCall}
        muted={muted}
        videoOff={videoOff}
        speakerOn={speakerOn}
        onToggleMute={onToggleMute}
        onToggleVideo={onToggleVideo}
        onSwitchCamera={onSwitchCamera}
        onToggleSpeaker={onToggleSpeaker}
        onEnd={onLeave}
      />
    </div>
  );
}

// ---------------------------------------------------------------------
// Group active call — grid of tiles, active speaker highlighted
// ---------------------------------------------------------------------
function ParticipantTile({ uid, stream, isLocal, isVideoCall, speakerOn, stats }) {
  const profile = useUserProfile(uid);
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const speaking = useIsSpeaking(stream);
  const hasVideo = isVideoCall && !!stream && stream.getVideoTracks().length > 0;

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream || null;
  }, [stream]);

  // Remote tiles get their own dedicated <audio> element (same reliable
  // pattern as the 1-on-1 layout); the local tile never plays its own audio.
  useEffect(() => {
    if (isLocal || !audioRef.current) return;
    audioRef.current.srcObject = stream || null;
    if (stream) audioRef.current.play().catch(() => {});
  }, [stream, isLocal]);

  useEffect(() => {
    if (!isLocal) applySinkId(audioRef.current, speakerOn);
  }, [speakerOn, isLocal, stream]);

  return (
    <div className={'call-grid-tile' + (speaking ? ' speaking' : '')}>
      {!isLocal && <audio ref={audioRef} autoPlay />}
      {hasVideo ? (
        <video ref={videoRef} className="call-grid-video" autoPlay playsInline muted />
      ) : (
        <div className="call-grid-avatar-wrap"><Avatar profile={profile} size={64} /></div>
      )}
      <div className="call-grid-label">
        <span>{isLocal ? 'You' : (profile.name || 'Member')}</span>
        {!isLocal && <QualityBadge stats={stats} />}
      </div>
    </div>
  );
}

function GroupActiveLayout({
  call, otherUids, remoteStreams, localStream, muted, videoOff, speakerOn, callStats,
  onLeave, onToggleMute, onToggleVideo, onSwitchCamera, onToggleSpeaker,
}) {
  const { currentUser } = useAuth();
  const [startedAt] = useState(() => Date.now());
  const isVideoCall = call.callType === 'video';

  return (
    <div className="call-overlay call-overlay-active call-overlay-group">
      <div className="call-active-header call-active-header-group">
        <h2 className="call-caller-name">Group call · {otherUids.length + 1}</h2>
        <CallTimer startedAt={startedAt} />
      </div>

      <div className="call-grid">
        <ParticipantTile uid={currentUser.uid} stream={localStream} isLocal isVideoCall={isVideoCall} speakerOn={speakerOn} />
        {otherUids.map((uid) => (
          <ParticipantTile key={uid} uid={uid} stream={remoteStreams[uid]} isLocal={false} isVideoCall={isVideoCall} speakerOn={speakerOn} stats={callStats?.[uid]} />
        ))}
      </div>

      <CallControlsBar
        isVideoCall={isVideoCall}
        muted={muted}
        videoOff={videoOff}
        speakerOn={speakerOn}
        onToggleMute={onToggleMute}
        onToggleVideo={onToggleVideo}
        onSwitchCamera={onSwitchCamera}
        onToggleSpeaker={onToggleSpeaker}
        onEnd={onLeave}
      />
    </div>
  );
}

// ---------------------------------------------------------------------
function ActiveCallOverlay(props) {
  const { currentUser } = useAuth();
  const otherUids = (props.call.participants || []).filter((u) => u !== currentUser.uid);

  if (otherUids.length > 1) {
    return <GroupActiveLayout {...props} otherUids={otherUids} />;
  }
  return <OneOnOneActiveLayout {...props} otherUid={otherUids[0]} />;
}

// ---------------------------------------------------------------------
export default function CallScreen() {
  const {
    activeCall, remoteStreams, localStream, muted, videoOff, incomingCall, callStats,
    joinCall, leaveCall, declineCall, toggleMute, toggleVideo, switchCamera,
  } = useCall();

  const [speakerOn, setSpeakerOn] = useState(false);
  const onToggleSpeaker = () => setSpeakerOn((v) => !v);

  if (activeCall && activeCall.status === 'ringing') {
    return (
      <OutgoingCallOverlay
        call={activeCall}
        localStream={localStream}
        muted={muted}
        videoOff={videoOff}
        speakerOn={speakerOn}
        onLeave={leaveCall}
        onToggleMute={toggleMute}
        onToggleVideo={toggleVideo}
        onSwitchCamera={switchCamera}
        onToggleSpeaker={onToggleSpeaker}
      />
    );
  }

  if (activeCall) {
    return (
      <ActiveCallOverlay
        call={activeCall}
        remoteStreams={remoteStreams}
        localStream={localStream}
        muted={muted}
        videoOff={videoOff}
        speakerOn={speakerOn}
        callStats={callStats}
        onLeave={leaveCall}
        onToggleMute={toggleMute}
        onToggleVideo={toggleVideo}
        onSwitchCamera={switchCamera}
        onToggleSpeaker={onToggleSpeaker}
      />
    );
  }

  if (incomingCall) {
    return <IncomingCallOverlay call={incomingCall} onAccept={() => joinCall(incomingCall)} onDecline={declineCall} />;
  }

  return null;
          }
