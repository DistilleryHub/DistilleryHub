// functions/api/account/cancel-deletion.js
// Replaces exports.cancelAccountDeletion from deleteAccount.js.
// Route: POST /api/account/cancel-deletion   (Authorization: Bearer <idToken>)

import { requireAuth, getAccessToken, fsMergeDoc, jsonResponse } from '../../_lib/firebaseAdmin.js';

export async function onRequestPost({ request, env }) {
  const user = await requireAuth(request, env);
  if (!user) return jsonResponse({ error: { message: 'Login zaroori hai.' } }, 401);

  try {
    const accessToken = await getAccessToken(env);
    await fsMergeDoc(env, accessToken, 'users', user.uid, {
      deletionRequested: false,
      deletionCancelled: true,
      deletionConfirmations: 0,
    });
    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: { message: 'Server error. Baad mein try karo.' } }, 500);
  }
}
