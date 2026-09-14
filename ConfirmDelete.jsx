import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export default function ConfirmDelete() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const uid = params.get('uid');
    const token = params.get('token');
    if (!uid || !token) {
      setStatus('error'); setMessage('Link invalid hai.');
      return;
    }
    const confirmDeletion = httpsCallable(functions, 'confirmAccountDeletion');
    confirmDeletion({ uid, token })
      .then((res) => {
        setStatus('success');
        setMessage(`Confirmation ${res.data.confirmations} of 3 ho gaya hai.`);
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err.message || 'Kuch galat ho gaya.');
      });
  }, [params]);

  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        {status === 'loading' && <p>Confirm ho raha hai…</p>}
        {status === 'success' && (
          <>
            <h2>✅ Confirm ho gaya</h2>
            <p>{message}</p>
            <button className="btn btn-primary" onClick={() => navigate('/')}>Home jaayein</button>
          </>
        )}
        {status === 'error' && (
          <>
            <h2>⚠️ Error</h2>
            <p>{message}</p>
          </>
        )}
      </div>
    </div>
  );
}
