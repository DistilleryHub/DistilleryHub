import { useEffect, useState, useRef } from 'react';
import {
  collection, query, orderBy, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { uploadToCloudinary } from './uploadUtils';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { IconFileText, IconImage, IconFolder } from './Icons';

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(name = '') {
  const ext = name.split('.').pop().toLowerCase();
  if (['pdf'].includes(ext)) return <IconFileText className="w-5 h-5" style={{ color: '#e5484d' }} />;
  if (['doc', 'docx'].includes(ext)) return <IconFileText className="w-5 h-5" style={{ color: '#4f7fff' }} />;
  if (['xls', 'xlsx', 'csv'].includes(ext)) return <IconFileText className="w-5 h-5" style={{ color: '#22c55e' }} />;
  if (['ppt', 'pptx'].includes(ext)) return <IconFileText className="w-5 h-5" style={{ color: '#f5936b' }} />;
  if (['zip', 'rar', '7z'].includes(ext)) return <IconFolder className="w-5 h-5" style={{ color: '#a78bfa' }} />;
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return <IconImage className="w-5 h-5" style={{ color: '#f5c542' }} />;
  return <IconFileText className="w-5 h-5" />;
}

export default function FilesPage() {
  const { currentUser, currentProfile } = useAuth();
  const toast = useToast();
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    const q = query(collection(db, 'files'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setFiles(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  async function handleFileChosen(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadToCloudinary(file, 'raw');
      await addDoc(collection(db, 'files'), {
        name: file.name,
        size: file.size,
        url,
        uploadedBy: currentUser.uid,
        uploadedByName: currentProfile?.name || 'Member',
        createdAt: serverTimestamp(),
      });
      toast('File uploaded');
    } catch (err) {
      toast('Upload failed');
    }
    setUploading(false);
  }

  async function removeFile(file) {
    if (file.uploadedBy !== currentUser.uid) return;
    if (!confirm(`Delete "${file.name}"?`)) return;
    await deleteDoc(doc(db, 'files', file.id));
  }

  const filtered = files.filter((f) =>
    f.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="files-page">
      <div className="card">
        <div className="composer-actions" style={{ marginBottom: search ? 10 : 0 }}>
          <button className="btn btn-primary btn-sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? <span className="spinner" /> : '+ Upload file'}
          </button>
          <input
            type="text"
            placeholder="Search files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 200 }}
          />
        </div>
        <input type="file" ref={inputRef} style={{ display: 'none' }} onChange={handleFileChosen} />
      </div>

      {filtered.length === 0 && (
        <div className="empty-state">
          {search ? 'No files match your search.' : 'No files shared yet.'}
        </div>
      )}

      {filtered.map((file) => (
        <div className="card file-row" key={file.id}>
          <div className="file-icon">{fileIcon(file.name)}</div>
          <div className="file-info">
            <a href={file.url} target="_blank" rel="noreferrer" className="file-name">{file.name}</a>
            <div className="job-meta">
              {formatSize(file.size)} • uploaded by {file.uploadedByName}
            </div>
          </div>
          <div className="file-actions">
            <a href={file.url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">Download</a>
            {file.uploadedBy === currentUser.uid && (
              <button className="btn btn-ghost btn-sm" onClick={() => removeFile(file)}>Delete</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
