import { useState } from 'react';
import { REPORT_REASONS, submitReport } from './reportUtils';
import { useAuth } from './AuthContext';

/**
 * Props:
 *   targetType, targetId — what's being reported (see reportUtils.js)
 *   extra — optional extra context fields to store on the report doc
 *   onClose — called when the dialog should close (cancel or after submit)
 *   onSubmitted — optional callback after a successful submit
 */
export default function ReportDialog({ targetType, targetId, extra = {}, onClose, onSubmitted }) {
  const { currentUser } = useAuth();
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    if (!reason) { setError('Pick a reason first.'); return; }
    setSubmitting(true);
    setError('');
    try {
      await submitReport(currentUser, targetType, targetId, reason, {
        ...(detail.trim() ? { detail: detail.trim().slice(0, 500) } : {}),
        ...extra,
      });
      onSubmitted?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Could not submit report.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: 'min(420px, 90vw)', maxHeight: '80vh', overflowY: 'auto', padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}>Report {targetType === 'user' ? 'this person' : targetType}</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '12px 0' }}>
          {REPORT_REASONS.map((r) => (
            <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
              <input type="radio" name="report-reason" checked={reason === r} onChange={() => setReason(r)} />
              {r}
            </label>
          ))}
        </div>

        <textarea
          placeholder="Additional details (optional)"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          rows={3}
          maxLength={500}
          style={{ width: '100%', resize: 'vertical', marginBottom: 8 }}
        />

        {error && <div style={{ color: '#e05555', fontSize: 13, marginBottom: 8 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={submitting}>Cancel</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting || !reason}>
            {submitting ? 'Submitting…' : 'Submit report'}
          </button>
        </div>
      </div>
    </div>
  );
}
