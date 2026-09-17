import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { notify } from './notify';
import { followUser, unfollowUser, listenMyFollowing } from './follows';

export default function Network() {
  const { currentUser, currentProfile } = useAuth();
  const toast = useToast();
  const [people, setPeople] = useState([]);
  const [connections, setConnections] = useState([]);
  const [followingIds, setFollowingIds] = useState(new Set());

  useEffect(() => {
    if (!currentUser) return;
    return listenMyFollowing(currentUser.uid, setFollowingIds);
  }, [currentUser]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      setPeople(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const qFrom = query(collection(db, 'connections'), where('from', '==', currentUser.uid));
    const qTo = query(collection(db, 'connections'), where('to', '==', currentUser.uid));
    let fromDocs = [], toDocs = [];
    const merge = () => setConnections([...fromDocs, ...toDocs]);
    const unsub1 = onSnapshot(qFrom, (snap) => { fromDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() })); merge(); });
    const unsub2 = onSnapshot(qTo, (snap) => { toDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() })); merge(); });
    return () => { unsub1(); unsub2(); };
  }, [currentUser]);

  function connectionWith(uid) {
    return connections.find((c) => c.from === uid || c.to === uid);
  }

  async function handleFollowToggle(person) {
    try {
      if (followingIds.has(person.id)) {
        await unfollowUser(currentUser.uid, person.id);
      } else {
        await followUser(currentUser.uid, person.id);
        notify({
          toUserId: person.id,
          type: 'follow',
          message: `${currentProfile?.name || 'Someone'} started following you`,
          link: `/profile/${currentUser.uid}`,
          fromUserId: currentUser.uid,
          fromUserName: currentProfile?.name || 'Member',
          fromUserPhoto: currentProfile?.photoURL || '',
        });
      }
    } catch (err) {
      console.error('handleFollowToggle failed', err);
      toast('Could not update follow');
    }
  }

  async function sendRequest(person) {
    try {
      // Deterministic ID (sorted pair) instead of a random one — lets
      // firestore.rules look up "are these two connected?" with a direct
      // get() (rules can't run queries) so whoCanMessage:'connections' can
      // be enforced server-side in messages/create, not just hidden in the UI.
      const connId = [currentUser.uid, person.id].sort().join('_');
      const connRef = doc(db, 'connections', connId);
      const batch = writeBatch(db);
      batch.set(connRef, {
        from: currentUser.uid, to: person.id, status: 'pending', createdAt: serverTimestamp(),
      });
      batch.set(doc(db, 'rateLimitsConnections', currentUser.uid), {
        lastConnectionRequestAt: serverTimestamp(),
      }, { merge: true });
      await batch.commit();
      notify({
        toUserId: person.id,
        type: 'connection_request',
        message: `${currentProfile?.name || 'Someone'} sent you a connection request`,
        link: '/network',
        fromUserId: currentUser.uid,
        fromUserName: currentProfile?.name || 'Member',
        fromUserPhoto: currentProfile?.photoURL || '',
      });
      toast(`Request sent to ${person.name}`);
    } catch (err) {
      console.error('sendRequest failed', err);
      if (err.code === 'permission-denied') {
        toast('Too many requests too fast — wait a moment and try again');
      } else {
        toast('Could not send request — check your connection and try again');
      }
    }
  }

  async function acceptRequest(conn) {
    try {
      await updateDoc(doc(db, 'connections', conn.id), { status: 'accepted' });
      notify({
        toUserId: conn.from,
        type: 'connection_accept',
        message: `${currentProfile?.name || 'Someone'} accepted your connection request`,
        link: '/network',
        fromUserId: currentUser.uid,
        fromUserName: currentProfile?.name || 'Member',
        fromUserPhoto: currentProfile?.photoURL || '',
      });
      toast('Request accepted');
    } catch (err) {
      console.error('acceptRequest failed', err);
      toast('Could not accept request — check your connection and try again');
    }
  }

  const visiblePeople = useMemo(() => {
    return people
      .filter((p) => p.id !== currentUser?.uid)
      .filter((p) => !(currentProfile?.blocked || []).includes(p.id))
      .filter((p) => !(p.blocked || []).includes(currentUser?.uid))
      .filter((p) => {
        if (!search.trim()) return true;
        const s = search.toLowerCase();
        return p.name?.toLowerCase().includes(s) || p.headline?.toLowerCase().includes(s) || p.company?.toLowerCase().includes(s);
      });
  }, [people, currentUser, currentProfile, search]);

  const pendingIncoming = connections.filter((c) => c.to === currentUser?.uid && c.status === 'pending');

  return (
    <div className="network-page">
      <div className="card">
        <input
          type="text"
          placeholder="Search people by name, company, or role..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {pendingIncoming.length > 0 && (
        <div className="card">
          <h3>Pending requests</h3>
          {pendingIncoming.map((conn) => {
            const person = people.find((p) => p.id === conn.from);
            if (!person) return null;
            return (
              <div className="person-row" key={conn.id}>
                <Link to={`/profile/${person.id}`} className="avatar">
                  {person.photoURL ? <img src={person.photoURL} alt="" /> : (person.name?.[0] || '?')}
                </Link>
                <div className="person-info">
                  <Link to={`/profile/${person.id}`} className="person-name">{person.name}</Link>
                  <div className="person-headline">{person.headline}</div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => acceptRequest(conn)}>Accept</button>
              </div>
            );
          })}
        </div>
      )}

      <div className="people-grid">
        {visiblePeople.map((person) => {
          const conn = connectionWith(person.id);
          return (
            <div className="card person-card" key={person.id}>
              <Link to={`/profile/${person.id}`} className="avatar avatar-lg">
                {person.photoURL ? <img src={person.photoURL} alt="" /> : (person.name?.[0] || '?')}
              </Link>
              <Link to={`/profile/${person.id}`} className="person-name">{person.name}</Link>
              {person.headline && <div className="person-headline">{person.headline}</div>}
              {person.company && <div className="person-company">{person.company}</div>}
              <button
                type="button"
                className={'btn btn-sm btn-block' + (followingIds.has(person.id) ? ' btn-ghost' : ' btn-primary')}
                onClick={() => handleFollowToggle(person)}
              >
                {followingIds.has(person.id) ? 'Following' : '+ Follow'}
              </button>
              {!conn && (
                <button className="btn btn-ghost btn-sm btn-block" onClick={() => sendRequest(person)}>
                  Connect
                </button>
              )}
              {conn?.status === 'pending' && conn.from === currentUser.uid && (
                <button className="btn btn-ghost btn-sm btn-block" disabled>Pending</button>
              )}
              {conn?.status === 'pending' && conn.to === currentUser.uid && (
                <button className="btn btn-primary btn-sm btn-block" onClick={() => acceptRequest(conn)}>
                  Accept request
                </button>
              )}
              {conn?.status === 'accepted' && (
                <button className="btn btn-ghost btn-sm btn-block" disabled>Connected</button>
              )}
            </div>
          );
        })}
        {visiblePeople.length === 0 && <div className="empty-state">No one matches your search.</div>}
      </div>
    </div>
  );
}
