import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { shareToConnection, nativeShare } from './share';
import { IconX, IconSend } from './Icons';

// item: { title, snippet, link } — link should be an absolute-ish app URL.
export default function ShareSheet({ item, onClose }) {
  const { currentUser, currentProfile } = useAuth();
  const toast = useToast();
  const [connections, setConnections] = useState([]);
  const [people, setPeople] = useState({});
  const [sendingTo, setSendingTo] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const map = {};
      snap.docs.forEach((d) => { map[d.id] = { id: d.id, ...d.data() }; });
      setPeople(map);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const qFrom = query(collection(db, 'connections'), where('from', '==', currentUser.uid), where('status', '==', 'accepted'));
    const qTo = query(collection(db, 'connections'), where('to', '==', currentUser.uid), where('status', '==', 'accepted'));
    let fromDocs = [], toDocs = [];
    const merge = () => setConnections([...fromDocs, ...toDocs]);
    const unsub1 = onSnapshot(qFrom, (snap) => { fromDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() })); merge(); });
    const unsub2 = onSnapshot(qTo, (snap) => { toDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() })); merge(); });
    return () => { unsub1(); unsub2(); };
  }, [currentUser]);

  const connectionUids = connections.map((c) => (c.from === currentUser.uid ? c.to : c.from));
  const shareText = `${item.title || 'Check this out'}${item.snippet ? ' — ' + item.snippet : ''}`;

  async function sendTo(uid) {
    setSendingTo(uid);
    try {
      await shareToConnection(currentUser, currentProfile, uid, `${shareText}\n${item.link}`);
      toast(`Shared with ${people[uid]?.name || 'them'}`);
      onClose();
    } catch (err) {
      toast('Could not share — check your connection');
    }
    setSendingTo(null);
  }

  async function handleNativeShare() {
    try {
      const result = await nativeShare({ title: item.title, text: shareText, url: item.link });
      if (result === 'copied') toast('Link copied — paste it anywhere');
      if (result === 'shared') onClose();
    } catch (err) {
      toast('Could not share');
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card" style={{ maxWidth: 420, margin: '10vh auto', padding: 16 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Share</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><IconX className="w-4 h-4" /></button>
        </div>

        <button className="btn btn-primary btn-block" onClick={handleNativeShare} style={{ marginBottom: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <IconSend className="w-4 h-4" /> Share via… (WhatsApp, Instagram, etc.)
        </button>

        <div className="settings-subheading">Send to a connection</div>
        {connectionUids.length === 0 && (
          <div className="empty-state">No connections yet — add some in Network first.</div>
        )}
        <div style={{ maxHeight: 280, overflowY: 'auto' }}>
          {connectionUids.map((uid) => (
            <div className="person-row" key={uid}>
              <div className="avatar">
                {people[uid]?.photoURL ? <img src={people[uid].photoURL} alt="" /> : (people[uid]?.name?.[0] || '?')}
              </div>
              <div className="person-info">
                <div className="person-name">{people[uid]?.name || 'Member'}</div>
              </div>
              <button className="btn btn-ghost btn-sm" disabled={sendingTo === uid} onClick={() => sendTo(uid)}>
                {sendingTo === uid ? <span className="spinner" /> : 'Send'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
