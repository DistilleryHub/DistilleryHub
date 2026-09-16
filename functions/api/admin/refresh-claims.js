// functions/api/admin/refresh-claims.js
// Replaces exports.refreshMyClaims from index.js.
// Route: POST /api/admin/refresh-claims   (Authorization: Bearer <idToken>)
//
// Lets the client read a user's current claims right after a
// promotion/demotion, since ID tokens cache claims client-side until
// force-refreshed with getIdToken(true).

import { requireAuth, getAccessToken, getUserClaims, jsonResponse } from '../../_lib/firebaseAdmin.js';

export async function onRequestPost({ request, env }) {
  const user = await requireAuth(request, env);
  if (!user) return jsonResponse({ error: { message: 'You must be signed in.' } }, 401);

  try {
    const accessToken = await getAccessToken(env);
    const claims = (await getUserClaims(env, accessToken, user.uid)) || {};
    return jsonResponse({ claims });
  } catch (err) {
    return jsonResponse({ error: { message: 'Server error. Baad mein try karo.' } }, 500);
  }
}
