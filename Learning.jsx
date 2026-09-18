import { useEffect, useState } from 'react';
import {
  collection, query, orderBy, onSnapshot, addDoc, deleteDoc, doc,
  updateDoc, arrayUnion, arrayRemove, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { IconCheck } from './Icons';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

export default function Learning() {
  const { currentUser, currentProfile } = useAuth();
  const toast = useToast();
  const [courses, setCourses] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', link: '', description: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'courses'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setCourses(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'courses'), {
        ...form,
        addedBy: currentUser.uid,
        addedByName: currentProfile?.name || 'Member',
        completedBy: [],
        createdAt: serverTimestamp(),
      });
      setForm({ title: '', link: '', description: '' });
      setShowForm(false);
      toast('Course added');
    } catch (err) {
      toast(err.message || 'Could not add course');
    }
    setSaving(false);
  }

  async function toggleComplete(course) {
    const done = course.completedBy?.includes(currentUser.uid);
    await updateDoc(doc(db, 'courses', course.id), {
      completedBy: done ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid),
    });
  }

  async function removeCourse(course) {
    if (course.addedBy !== currentUser.uid) return;
    if (!confirm('Delete this course?')) return;
    await deleteDoc(doc(db, 'courses', course.id));
  }

  return (
    <div className="learning-page">
      <div className="card">
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : '+ Add course / resource'}
        </button>
      </div>

      {showForm && (
        <form className="card" onSubmit={handleSubmit}>
          <div className="form-field">
            <input type="text" placeholder="Title" value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="form-field">
            <input type="text" placeholder="Link (course URL, PDF, etc.)" value={form.link}
              onChange={(e) => setForm({ ...form, link: e.target.value })} />
          </div>
          <div className="form-field">
            <textarea placeholder="Description" rows={2} value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
            {saving ? <span className="spinner" /> : 'Add'}
          </button>
        </form>
      )}

      {courses.length === 0 && <div className="empty-state">No learning resources yet.</div>}

      {courses.map((course) => {
        const done = course.completedBy?.includes(currentUser.uid);
        return (
          <div className="card course-card" key={course.id}>
            <div className="job-title">{course.title}</div>
            <div className="job-meta">added by {course.addedByName}</div>
            {course.description && <p className="job-description">{course.description}</p>}
            <div className="job-footer">
              <div className="job-actions">
                {course.link && (
                  <a href={course.link} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                    Open resource
                  </a>
                )}
                <button
                  className={'btn btn-sm' + (done ? ' btn-primary' : ' btn-ghost')}
                  onClick={() => toggleComplete(course)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  {done ? (<><IconCheck className="w-3.5 h-3.5" /> Completed</>) : 'Mark complete'}
                </button>
              </div>
              <div className="job-applicants">
                {course.completedBy?.length || 0} completed
              </div>
            </div>
            {course.addedBy === currentUser.uid && (
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => removeCourse(course)}>
                Delete
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
