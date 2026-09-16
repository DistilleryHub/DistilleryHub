// functions/api/account/confirm-deletion.js
// Replaces exports.confirmAccountDeletion from deleteAccount.js.
// Route: POST /api/account/confirm-deletion   body: { uid, token }
// (No auth required — this is the link the user clicks from email, same as the original.)

import { getAccessToken, fsGetDoc, fsMergeDoc, jsonResponse, randomHex } from '../../_lib/firebaseAdmin.js';

export async function onRequestPost({ request, env }) {
  try {
    const { uid, token } = await request.json();
    if (!uid || !token) return jsonResponse({ error: { message: 'Link invalid hai.' } }, 400);

    const accessToken = await getAccessToken(env);
    const userData = await fsGetDoc(env, accessToken, 'users', uid);
    if (!userData) return jsonResponse({ error: { message: 'User nahi mila.' } }, 404);

    if (!userData.deletionRequested || userData.deletionCancelled) {
      return jsonResponse({ error: { message: 'Deletion request active nahi hai.' } }, 412);
    }
    if (userData.deletionToken !== token) {
      return jsonResponse({ error: { message: 'Link expire ho chuka hai.' } }, 403);
    }

    const confirmations = (userData.deletionConfirmations || 0) + 1;
    await fsMergeDoc(env, accessToken, 'users', uid, {
      deletionConfirmations: confirmations,
      deletionToken: randomHex(24),
    });

    return jsonResponse({ ok: true, confirmations });
  } catch (err) {
    return jsonResponse({ error: { message: 'Server error. Baad mein try karo.' } }, 500);
  }
}
