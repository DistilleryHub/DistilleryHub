const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

/**
 * ⚠️ REQUIRES CONFIG — set these before deploying:
 *   firebase functions:config:set cloudinary.api_key="YOUR_KEY" cloudinary.api_secret="YOUR_SECRET" cloudinary.cloud_name="y8iguofl"
 * The API secret must NEVER be in client code (it was never in the old
 * unsigned-preset flow either, but calling that out since this function's
 * whole job is to keep it that way on the server side only).
 */
const cfg = functions.config().cloudinary || {};
const CLOUDINARY_API_KEY = cfg.api_key;
const CLOUDINARY_API_SECRET = cfg.api_secret;
const CLOUDINARY_CLOUD_NAME = cfg.cloud_name || 'y8iguofl';

const MAX_UPLOADS_PER_WINDOW = 20;
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Callable: returns a short-lived signature the client uses to upload
 * directly to Cloudinary (Cloudinary's API, not ours, still receives the
 * actual file bytes — this function never touches file content, just
 * authorizes + rate-limits who's allowed to upload).
 *
 * Why this replaces the unsigned preset: an unsigned upload_preset has no
 * per-user identity attached to it at all — anyone who reads the cloud name
 * + preset out of the client bundle (trivial: it's plain JS) can POST
 * unlimited files straight to Cloudinary forever, with zero connection to
 * this app's auth. That's a storage-cost and abuse-liability risk (illegal/
 * abusive content ends up hosted under this app's Cloudinary account).
 * Requiring a fresh signature per upload ties every upload to a signed-in
 * Firebase user AND lets us rate-limit server-side.
 */
exports.getCloudinarySignature = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in karke try karo.');
  }
  if (!CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Upload signing isn\u2019t configured on the server yet (REQUIRES CONFIG — see cloudinarySign.js).'
    );
  }

  // Sliding-window rate limit, tracked server-side — a client can't bypass
  // this the way it could with an unsigned preset, since every upload now
  // has to come through here first.
  const limitRef = db.collection('uploadRateLimits').doc(context.auth.uid);
  const now = Date.now();
  const snap = await limitRef.get();
  const existing = snap.exists ? snap.data() : null;
  let count = existing?.count || 0;
  let windowStart = existing?.windowStart || now;
  if (now - windowStart > WINDOW_MS) {
    count = 0;
    windowStart = now;
  }
  if (count >= MAX_UPLOADS_PER_WINDOW) {
    throw new functions.https.HttpsError(
      'resource-exhausted',
      'Upload limit reached — try again in a few minutes.'
    );
  }
  await limitRef.set({ count: count + 1, windowStart }, { merge: true });

  const timestamp = Math.round(now / 1000);
  const folder = `distilleryhub/${context.auth.uid}`;
  const toSign = `folder=${folder}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;
  const signature = crypto.createHash('sha1').update(toSign).digest('hex');

  return { signature, timestamp, apiKey: CLOUDINARY_API_KEY, cloudName: CLOUDINARY_CLOUD_NAME, folder };
});
