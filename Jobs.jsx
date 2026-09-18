import { useEffect, useMemo, useState } from 'react';
import {
  collection, query, orderBy, onSnapshot, addDoc, deleteDoc, doc,
  updateDoc, arrayUnion, arrayRemove, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { notify } from './notify';
import { bookmarkDocId, toggleBookmark, listenBookmarks } from './bookmarks';
import { IconBookmark, IconCheck } from './Icons';

export default function Jobs() {
  const { currentUser, currentProfile } = useAuth();
  const toast = useToast();
  const [jobs, setJobs] = useState([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', company: '', location: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [bookmarkIds, setBookmarkIds] = useState(new Set());

  useEffect(() => {
    if (!currentUser) return;
    return listenBookmarks(currentUser.uid, (list) => setBookmarkIds(new Set(list.map((b) => b.id))));
  }, [currentUser]);

  useEffect(() => {
    const q = query(collection(db, 'jobs'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setJobs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.company.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'jobs'), {
        ...form,
        postedBy: currentUser.uid,
        postedByName: currentProfile?.name || 'Member',
        applicants: [],
        createdAt: serverTimestamp(),
      });
      setForm({ title: '', company: '', location: '', description: '' });
      setShowForm(false);
      toast('Job posted');
    } catch (err) {
      toast(err.message || 'Could not post job');
    }
    setSaving(false);
  }

  async function toggleApply(job) {
    const applied = job.applicants?.includes(currentUser.uid);
    await updateDoc(doc(db, 'jobs', job.id), {
      applicants: applied ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid),
    });
    if (!applied) {
      notify({
        toUserId: job.postedBy,
        type: 'job_application',
        message: `${currentProfile?.name || 'Someone'} applied to your job "${job.title}"`,
        link: '/jobs',
        fromUserId: currentUser.uid,
        fromUserName: currentProfile?.name || 'Member',
        fromUserPhoto: currentProfile?.photoURL || '',
      });
    }
    toast(applied ? 'Application withdrawn' : 'Applied');
  }

  async function removeJob(job) {
    if (job.postedBy !== currentUser.uid) return;
    if (!confirm('Delete this job posting?')) return;
    await deleteDoc(doc(db, 'jobs', job.id));
  }

  const visibleJobs = useMemo(() => {
    if (!search.trim()) return jobs;
    const s = search.toLowerCase();
    return jobs.filter((j) =>
      j.title?.toLowerCase().includes(s) ||
      j.company?.toLowerCase().includes(s) ||
      j.location?.toLowerCase().includes(s)
    );
  }, [jobs, search]);

  return (
    <div className="jobs-page">
      <div className="card">
        <input
          type="text"
          placeholder="Search jobs by title, company, or location..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : 'Post a job'}
        </button>
      </div>

      {showForm && (
        <form className="card" onSubmit={handleSubmit}>
          <div className="form-field">
            <input type="text" placeholder="Job title" value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="form-field">
            <input type="text" placeholder="Company" value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </div>
          <div className="form-field">
            <input type="text" placeholder="Location" value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
          <div className="form-field">
            <textarea placeholder="Description" rows={4} value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
            {saving ? <span className="spinner" /> : 'Post job'}
          </button>
        </form>
      )}

      {visibleJobs.length === 0 && <div className="empty-state">No jobs found.</div>}

      {visibleJobs.map((job) => {
        const applied = job.applicants?.includes(currentUser.uid);
        return (
          <div className="card job-card" key={job.id}>
            <div className="job-title">{job.title}</div>
            <div className="job-meta">{job.company}{job.location ? ` • ${job.location}` : ''}</div>
            {job.description && <p className="job-description">{job.description}</p>}
            <div className="job-footer">
              <span className="job-posted-by">Posted by {job.postedByName}</span>
              <div className="job-actions">
                <button
                  className={'btn btn-ghost btn-sm' + (bookmarkIds.has(bookmarkDocId('job', job.id)) ? ' active' : '')}
                  onClick={() => toggleBookmark(currentUser.uid, bookmarkIds.has(bookmarkDocId('job', job.id)), {
                    type: 'job',
                    itemId: job.id,
                    title: job.title,
                    snippet: job.company + (job.location ? ` • ${job.location}` : ''),
                    imageURL: '',
                    link: '/jobs',
                  })}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <IconBookmark className="w-4 h-4" filled={bookmarkIds.has(bookmarkDocId('job', job.id))} />
                  {bookmarkIds.has(bookmarkDocId('job', job.id)) ? 'Saved' : 'Save'}
                </button>
                {job.postedBy === currentUser.uid ? (
                  <>
                    <span className="job-applicants">{job.applicants?.length || 0} applicants</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => removeJob(job)}>Delete</button>
                  </>
                ) : (
                  <button
                    className={'btn btn-sm ' + (applied ? 'btn-ghost' : 'btn-primary')}
                    onClick={() => toggleApply(job)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    {applied ? (<><IconCheck className="w-3.5 h-3.5" /> Applied</>) : 'Apply'}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
