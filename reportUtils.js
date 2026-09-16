import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

/**
 * targetType: 'user' | 'message' | 'post' | 'group' | 'listing' (extend as needed)
 * targetId: id of the thing being reported
 * reason: short string, e.g. 'Spam', 'Harassment', 'Inappropriate content'
 * extra: optional context (e.g. { chatId, messageText } for a message report) —
 *   kept minimal on purpose. We do NOT copy full private message threads into
 *   the report doc; admins should only see what's needed to act on the
 *   report, not get a free pass to browse someone's DMs.
 */
export async function submitReport(currentUser, targetType, targetId, reason, extra = {}) {
  if (!currentUser) throw new Error('Sign in required.');
  if (!targetType || !targetId || !reason) throw new Error('Missing report details.');
  await addDoc(collection(db, 'reports'), {
    reportedBy: currentUser.uid,
    targetType,
    targetId,
    reason,
    status: 'open',
    createdAt: serverTimestamp(),
    ...extra,
  });
}

export const REPORT_REASONS = [
  'Spam',
  'Harassment or abuse',
  'Inappropriate content',
  'Fake profile',
  'Scam / fraud',
  'Other',
];
