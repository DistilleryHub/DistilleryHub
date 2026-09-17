// functions/api/account/request-deletion.js
// Replaces exports.requestAccountDeletion from deleteAccount.js.
// Route: POST /api/account/request-deletion  (Authorization: Bearer <idToken>)

import { requireAuth, getAccessToken, fsGetDoc, fsMergeDoc, getAuthUser, jsonResponse, randomHex } from '../_lib/firebaseAdmin.js';
import { sendConfirmDeletionEmail } from '../_lib/email.js';

export async function onRequestPost({ request, env }) {
  const user = await requireAuth(request, env);
  if (!user) return jsonResponse({ error: { message: 'Login zaroori hai.' } }, 401);

  try {
    const accessToken = await getAccessToken(env);
    const userData = await fsGetDoc(env, accessToken, 'users', user.uid);
    if (!userData) return jsonResponse({ error: { message: 'User nahi mila.' } }, 404);

    const token = randomHex(24);
    const now = new Date();
    const scheduledAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    await fsMergeDoc(env, accessToken, 'users', user.uid, {
      deletionRequested: true,
      deletionCancelled: false,
      deletionRequestedAt: now,
      deletionScheduledAt: scheduledAt,
      deletionConfirmations: 0,
      deletionToken: token,
      deletionEmailsSent: 1,
    });

    const authUser = await getAuthUser(env, accessToken, user.uid);
    await sendConfirmDeletionEmail(env, authUser.email, userData.name, user.uid, token, 1);

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: { message: 'Server error. Baad mein try karo.' } }, 500);
  }
}
