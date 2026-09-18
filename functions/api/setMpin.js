// functions/api/setMpin.js
// Called from Settings.jsx's "MPIN Set/Update karo" form.
// Client call: apiFetch('/api/setMpin', { body: { mobile, mpin } })
// — apiFetch (see firebase.js) automatically attaches the signed-in user's
// Firebase ID token as an Authorization: Bearer header, which requireAuth
// below verifies.
//
// Stores the bcrypt hash in userSecrets/{uid} — NOT on the public users/{uid}
// doc — because firestore.rules locks userSecrets to `allow read, write: if
// false`, so only server code with the service account (this function) can
// ever read or write it. The plaintext MPIN itself is never stored anywhere.

import bcrypt from 'bcryptjs';
import { requireAuth, getAccessToken, fsMergeDoc, fsQueryByField, jsonResponse } from '../_lib/firebaseAdmin.js';

const SECRETS_COLLECTION = 'userSecrets';

export async function onRequestPost({ request, env }) {
  try {
    const user = await requireAuth(request, env);
    if (!user) return jsonResponse({ error: { message: 'Login zaroori hai.' } }, 401);

    const { mobile, mpin } = await request.json();

    if (!mobile || !mpin) {
      return jsonResponse({ error: { message: 'Mobile number aur MPIN dono chahiye.' } }, 400);
    }
    if (!/^\d{10}$/.test(mobile)) {
      return jsonResponse({ error: { message: 'Mobile number 10 digit ka hona chahiye.' } }, 400);
    }
    if (!/^\d{4,6}$/.test(mpin)) {
      return jsonResponse({ error: { message: 'MPIN 4 se 6 digit ka hona chahiye.' } }, 400);
    }

    const accessToken = await getAccessToken(env);

    // Make sure this mobile number isn't already linked to a DIFFERENT
    // account — mpinLogin.js looks users up by mobile, so two accounts
    // sharing one number would make login ambiguous.
    const existing = await fsQueryByField(env, accessToken, 'users', 'mobile', 'EQUAL', mobile);
    if (existing && existing.id !== user.uid) {
      return jsonResponse(
        { error: { message: 'Yeh mobile number pehle se kisi aur account se linked hai.' } },
        409
      );
    }

    const mpinHash = bcrypt.hashSync(mpin, 10);

    // Public doc only gets the mobile number (mpinLogin.js queries users by
    // it) — the hash itself always goes to the locked-down secrets doc.
    await fsMergeDoc(env, accessToken, 'users', user.uid, { mobile });
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
