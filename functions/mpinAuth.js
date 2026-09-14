const functions = require('firebase-functions');
const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();

// MPIN hash lives ONLY here — never on the public users/{uid} doc, which any
// signed-in user can read per firestore.rules. userSecrets/{uid} has
// `allow read, write: if false` in firestore.rules, so only the Admin SDK
// (i.e. these Cloud Functions) can ever touch it.
const SECRETS_COLLECTION = 'userSecrets';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

// Generic error — same message/code whether the mobile number doesn't exist,
// the account has no MPIN set, or the MPIN is wrong. Distinct errors here let
// an attacker enumerate which mobile numbers are registered; this collapses
// all three into one indistinguishable response.
function genericAuthError() {
  return new functions.https.HttpsError('permission-denied', 'Mobile number ya MPIN galat hai.');
}

/**
 * Called by the client right after signup (or from a "change MPIN" screen)
 * while the user is authenticated. Hashes server-side and writes to the
 * protected collection — the client never computes or sees the hash.
 */
exports.setMpin = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in karke try karo.');
  }
  const { mpin } = data;
  if (!mpin || typeof mpin !== 'string' || !/^\d{4,6}$/.test(mpin)) {
    throw new functions.https.HttpsError('invalid-argument', 'MPIN 4-6 digit ka number hona chahiye.');
  }

  const mpinHash = bcrypt.hashSync(mpin, 10);
  await db.collection(SECRETS_COLLECTION).doc(context.auth.uid).set(
    { mpinHash, failedAttempts: 0, lockedUntil: null },
    { merge: true }
  );
  return { ok: true };
});

exports.mpinLogin = functions.https.onCall(async (data) => {
  const { mobile, mpin } = data;
  if (!mobile || !mpin) {
    throw new functions.https.HttpsError('invalid-argument', 'Mobile number aur MPIN dono chahiye.');
  }

  const userSnap = await db.collection('users').where('mobile', '==', mobile).limit(1).get();
  // Do NOT reveal whether the number is registered — fall through to the
  // same generic error as a wrong PIN.
  if (userSnap.empty) throw genericAuthError();

  const userDoc = userSnap.docs[0];
  const secretRef = db.collection(SECRETS_COLLECTION).doc(userDoc.id);
  const secretSnap = await secretRef.get();
  const secret = secretSnap.exists ? secretSnap.data() : null;

  if (!secret || !secret.mpinHash) throw genericAuthError();

  // Rate limiting: lock out after MAX_ATTEMPTS wrong tries for LOCKOUT_MS.
  const now = Date.now();
  if (secret.lockedUntil && secret.lockedUntil.toMillis && secret.lockedUntil.toMillis() > now) {
    throw new functions.https.HttpsError(
      'resource-exhausted',
      'Bahut zyada galat attempts. Thodi der baad try karo.'
    );
  }

  const match = bcrypt.compareSync(mpin, secret.mpinHash);
  if (!match) {
    const attempts = (secret.failedAttempts || 0) + 1;
    const update = { failedAttempts: attempts };
    if (attempts >= MAX_ATTEMPTS) {
      update.lockedUntil = admin.firestore.Timestamp.fromMillis(now + LOCKOUT_MS);
      update.failedAttempts = 0;
    }
    await secretRef.set(update, { merge: true });
    throw genericAuthError();
  }

  // Success — reset the counter.
  await secretRef.set({ failedAttempts: 0, lockedUntil: null }, { merge: true });

  const token = await admin.auth().createCustomToken(userDoc.id);
  return { token };
});
