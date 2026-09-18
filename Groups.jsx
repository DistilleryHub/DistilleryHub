import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  collection, query, orderBy, onSnapshot, addDoc, doc, setDoc, deleteDoc,
  serverTimestamp, increment, updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { uploadToCloudinary } from './uploadUtils';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { notify } from './notify';
import { IconFlask } from './Icons';

const CATEGORIES = [
  'Fermentation', 'Distillation', 'Plant Operations', 'Quality & Lab',
  'Safety & Compliance', 'Maintenance', 'Ethanol Production', 'General',
];

export default function Groups() {
  const { currentUser, currentProfile } = useAuth();
  const toast = useToast();
  const [groups, setGroups] = useState([]);
  const [myGroupIds, setMyGroupIds] = useState(new Set());
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', category: CATEGORIES[0] });
  const [cover, setCover] = useState(null);
  const [coverPreview, setCoverPreview] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'groups'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setGroups(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // Track which groups the current user belongs to, across all groups, by
  // listening to a lightweight denormalized list on their own user doc
  // (kept in sync by joinGroup/leaveGroup below) rather than querying every
  // group's members subcollection.
  useEffect(() => {
    if (!currentUser) return;
    const unsub = onSnapshot(doc(db, 'users', currentUser.uid), (snap) => {
      const data = snap.data();
      setMyGroupIds(new Set(data?.groupIds || []));
    });
    return unsub;
  }, [currentUser]);

  function handleCoverPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCover(file);
    setCoverPreview(URL.createObjectURL(file));
  }

  async function createGroup(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      let coverPhotoURL = '';
      if (cover) {
        coverPhotoURL = await uploadToCloudinary(cover, 'image');
      }
      const groupRef = await addDoc(collection(db, 'groups'), {
        name: form.name.trim(),
        description: form.description.trim(),
        category: form.category,
        coverPhotoURL,
        createdBy: currentUser.uid,
        memberCount: 1,
        createdAt: serverTimestamp(),
      });
      await joinGroup(groupRef.id, { silent: true, role: 'admin' });
      setForm({ name: '', description: '', category: CATEGORIES[0] });
      setCover(null); setCoverPreview('');
      setShowCreate(false);
      toast('Group created');
    } catch (err) {
      toast(err.message || 'Could not create group');
    }
    setCreating(false);
  }

  async function joinGroup(groupId, opts = {}) {
    await setDoc(doc(db, 'groups', groupId, 'members', currentUser.uid), {
      uid: currentUser.uid,
      name: currentProfile?.name || 'Member',
      photoURL: currentProfile?.photoURL || '',
      role: opts.role || 'member',
      joinedAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'groups', groupId), { memberCount: increment(1) });
    await updateDoc(doc(db, 'users', currentUser.uid), {
      groupIds: [...myGroupIds, groupId],
    });
    const group = groups.find((g) => g.id === groupId);
    if (!opts.silent && group?.createdBy) {
      notify({
        toUserId: group.createdBy,
        type: 'group_add',
        message: `${currentProfile?.name || 'Someone'} joined your group "${group.name}"`,
        link: `/groups/${groupId}`,
        fromUserId: currentUser.uid,
        fromUserName: currentProfile?.name || 'Member',
        fromUserPhoto: currentProfile?.photoURL || '',
      });
    }
    if (!opts.silent) toast('Joined group');
  }

  async function leaveGroup(groupId) {
    await deleteDoc(doc(db, 'groups', groupId, 'members', currentUser.uid));
    await updateDoc(doc(db, 'groups', groupId), { memberCount: increment(-1) });
    const next = new Set(myGroupIds);
    next.delete(groupId);
    await updateDoc(doc(db, 'users', currentUser.uid), { groupIds: [...next] });
    toast('Left group');
  }

  const filtered = groups.filter((g) =>
    !search.trim() ||
    g.name.toLowerCase().includes(search.toLowerCase()) ||
    g.category?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="groups-page">
      <div className="groups-header">
        <h1>Groups</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? 'Cancel' : '+ New group'}
        </button>
      </div>

      {showCreate && (
        <form className="card" onSubmit={createGroup}>
          {coverPreview && <img className="composer-preview-img" src={coverPreview} alt="" />}
          <label className="btn btn-ghost btn-sm">
            Add cover photo
            <input type="file" accept="image/*" hidden onChange={handleCoverPick} />
          </label>
          <div className="form-field">
            <input
              type="text" placeholder="Group name" value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="form-field">
            <textarea
              placeholder="What's this group about?" rows={2} value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="form-field">
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={creating || !form.name.trim()}>
            {creating ? <span className="spinner" /> : 'Create group'}
          </button>
        </form>
      )}

      <div className="form-field">
        <input
          type="text" placeholder="Search groups..." value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 && <div className="empty-state">No groups yet — start one.</div>}

      <div className="groups-grid">
        {filtered.map((g) => {
          const joined = myGroupIds.has(g.id);
          return (
            <div className="card group-card" key={g.id}>
              <Link to={`/groups/${g.id}`} className="group-card-link">
                {g.coverPhotoURL ? (
                  <img className="group-card-cover" src={g.coverPhotoURL} alt="" />
                ) : (
                  <div className="group-card-cover group-card-cover-placeholder"><IconFlask className="w-7 h-7" /></div>
                )}
                <div className="group-card-name">{g.name}</div>
                <div className="job-meta">{g.category} • {g.memberCount || 0} members</div>
                {g.description && <p className="job-description">{g.description}</p>}
              </Link>
              {joined ? (
                <button className="btn btn-ghost btn-sm btn-block" onClick={() => leaveGroup(g.id)}>
                  Leave
                </button>
              ) : (
                <button className="btn btn-primary btn-sm btn-block" onClick={() => joinGroup(g.id)}>
                  Join
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
