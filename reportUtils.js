import { addDoc, collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db, auth } from './firebase';

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
  // Batched with the rate-limit stamp (firestore.rules requires both to
  // land in the same commit — see rateLimitsReports there) so a signed-in
  // user can't flood the admin reports queue or harass someone via reports.
  const batch = writeBatch(db);
  const reportRef = doc(collection(db, 'reports'));
  batch.set(reportRef, {
    reportedBy: currentUser.uid,
    targetType,
    targetId,
    reason,
    status: 'open',
    createdAt: serverTimestamp(),
    ...extra,
  });
  batch.set(doc(db, 'rateLimitsReports', currentUser.uid), { lastReportAt: serverTimestamp() }, { merge: true });
  try {
    await batch.commit();
  } catch (err) {
    if (err.code === 'permission-denied') {
      throw new Error('Bahut jaldi jaldi reports bhej rahe ho — thodi der ruk ke try karo.');
    }
    throw err;
  }
}

export const REPORT_REASONS = [
  'Spam',
  'Harassment or abuse',
  'Inappropriate content',
  'Fake profile',
  'Scam / fraud',
  'Other',
];
