// functions/api/cloudinarySign.js
// Replaces exports.getCloudinarySignature from cloudinarySign.js.
// Client call changes to: fetch('/api/cloudinarySign', { headers: { Authorization: `Bearer ${idToken}` } })
//
// Set these as Cloudflare Pages secrets (dashboard → Settings → Environment variables):
//   CLOUDINARY_API_KEY
//   CLOUDINARY_API_SECRET
//   CLOUDINARY_CLOUD_NAME   (defaults to 'y8iguofl' below if unset)

import { requireAuth, getAccessToken, fsGetDoc, fsMergeDoc, jsonResponse, sha1Hex } from '../_lib/firebaseAdmin.js';

const MAX_UPLOADS_PER_WINDOW = 20;
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes

export async function onRequestPost({ request, env }) {
  const user = await requireAuth(request, env);
  if (!user) return jsonResponse({ error: { message: 'Sign in karke try karo.' } }, 401);

  const apiKey = env.CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;
  const cloudName = env.CLOUDINARY_CLOUD_NAME || 'y8iguofl';

  if (!apiKey || !apiSecret) {
    return jsonResponse(
      { error: { message: 'Upload signing isn\u2019t configured on the server yet (set CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET).' } },
      412
    );
  }

  try {
    const accessToken = await getAccessToken(env);

    // Sliding-window rate limit, tracked server-side — same behaviour as the
    // original: a client can't bypass this since every upload has to come
    // through here first to get a signature.
    const now = Date.now();
    const existing = await fsGetDoc(env, accessToken, 'uploadRateLimits', user.uid);
    let count = existing?.count || 0;
    let windowStart = existing?.windowStart ? new Date(existing.windowStart).getTime() : now;
    if (now - windowStart > WINDOW_MS) {
      count = 0;
      windowStart = now;
    }
    if (count >= MAX_UPLOADS_PER_WINDOW) {
      return jsonResponse({ error: { message: 'Upload limit reached — try again in a few minutes.' } }, 429);
    }
    await fsMergeDoc(env, accessToken, 'uploadRateLimits', user.uid, {
      count: count + 1,
      windowStart: new Date(windowStart),
    });

    const timestamp = Math.round(now / 1000);
    const folder = `distilleryhub/${user.uid}`;
    const toSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    const signature = await sha1Hex(toSign);

    return jsonResponse({ signature, timestamp, apiKey, cloudName, folder });
  } catch (err) {
    return jsonResponse({ error: { message: 'Server error. Baad mein try karo.' } }, 500);
  }
}
