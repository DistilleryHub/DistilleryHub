// functions/api/setMpin.js
// Replaces exports.setMpin from mpinAuth.js.
// Client must send the user's Firebase ID token (from auth.currentUser.getIdToken())
// as: fetch('/api/setMpin', { headers: { Authorization: `Bearer ${idToken}` }, method: 'POST', body: JSON.stringify({ mpin }) })

import bcrypt from 'bcryptjs';
import { requireAuth, getAccessToken, fsMergeDoc, jsonResponse } from '../_lib/firebaseAdmin.js';

const SECRETS_COLLECTION = 'userSecrets';

export async function onRequestPost({ request, env }) {
  const user = await requireAuth(request, env);
  if (!user) return jsonResponse({ error: { message: 'Sign in karke try karo.' } }, 401);

  try {
    const { mpin } = await request.json();
    if (!mpin || typeof mpin !== 'string' || !/^\d{4,6}$/.test(mpin)) {
      return jsonResponse({ error: { message: 'MPIN 4-6 digit ka number hona chahiye.' } }, 400);
    }

    const mpinHash = bcrypt.hashSync(mpin, 10);
    const accessToken = await getAccessToken(env);
    await fsMergeDoc(env, accessToken, SECRETS_COLLECTION, user.uid, {
      mpinHash,
      failedAttempts: 0,
      lockedUntil: null,
    });
    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: { message: 'Server error. Baad mein try karo.' } }, 500);
  }
}
