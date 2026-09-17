// functions/api/mpinLogin.js
// Replaces exports.mpinLogin from mpinAuth.js.
// Client call changes from httpsCallable(functions, 'mpinLogin')({mobile, mpin})
// to: fetch('/api/mpinLogin', { method: 'POST', body: JSON.stringify({ mobile, mpin }) })

import bcrypt from 'bcryptjs';
import { getAccessToken, fsQueryByField, fsGetDoc, fsMergeDoc, createCustomToken, jsonResponse } from '../_lib/firebaseAdmin.js';

// MPIN hash lives ONLY here — never on the public users/{uid} doc, which any
// signed-in user can read per firestore.rules. userSecrets/{uid} has
// `allow read, write: if false` in firestore.rules, so only server code with
// the service account (this function) can ever touch it.
const SECRETS_COLLECTION = 'userSecrets';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

// Generic error — same message whether the mobile number doesn't exist, the
// account has no MPIN set, or the MPIN is wrong. Distinct errors here would
// let an attacker enumerate which mobile numbers are registered.
function genericAuthError() {
  return jsonResponse({ error: { message: 'Mobile number ya MPIN galat hai.' } }, 401);
}

export async function onRequestPost({ request, env }) {
  try {
    const { mobile, mpin } = await request.json();
    if (!mobile || !mpin) {
      return jsonResponse({ error: { message: 'Mobile number aur MPIN dono chahiye.' } }, 400);
    }

    const accessToken = await getAccessToken(env);

    const userHit = await fsQueryByField(env, accessToken, 'users', 'mobile', 'EQUAL', mobile);
    // Do NOT reveal whether the number is registered — fall through to the
    // same generic error as a wrong PIN.
    if (!userHit) return genericAuthError();

    const secret = await fsGetDoc(env, accessToken, SECRETS_COLLECTION, userHit.id);
    if (!secret || !secret.mpinHash) return genericAuthError();

    // Rate limiting: lock out after MAX_ATTEMPTS wrong tries for LOCKOUT_MS.
    const now = Date.now();
    if (secret.lockedUntil && new Date(secret.lockedUntil).getTime() > now) {
      return jsonResponse({ error: { message: 'Bahut zyada galat attempts. Thodi der baad try karo.' } }, 429);
    }

    const match = bcrypt.compareSync(mpin, secret.mpinHash);
    if (!match) {
      const attempts = (secret.failedAttempts || 0) + 1;
      const update = { failedAttempts: attempts };
      if (attempts >= MAX_ATTEMPTS) {
        update.lockedUntil = new Date(now + LOCKOUT_MS);
        update.failedAttempts = 0;
      }
      await fsMergeDoc(env, accessToken, SECRETS_COLLECTION, userHit.id, update);
      return genericAuthError();
    }

    // Success — reset the counter.
    await fsMergeDoc(env, accessToken, SECRETS_COLLECTION, userHit.id, {
      failedAttempts: 0,
      lockedUntil: null,
    });

    const token = await createCustomToken(env, userHit.id);
    return jsonResponse({ token });
  } catch (err) {
    // TEMPORARY DEBUG — reveals the real error instead of a generic message.
    // Revert this catch block back to the generic message once the root
    // cause is found and fixed (don't leak internal errors in production).
    return jsonResponse({ error: { message: 'DEBUG: ' + (err && err.message ? err.message : String(err)) } }, 500);
  }
}
