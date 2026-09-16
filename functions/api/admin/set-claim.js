// functions/api/admin/set-claim.js
// Replaces exports.setAdminClaim from index.js.
// Route: POST /api/admin/set-claim   (Authorization: Bearer <idToken>)
// Body: { targetUid, makeAdmin }
//
// Only callable by someone who already holds the admin custom claim
// (checked from their verified ID token via requireAuth's `admin` field,
// never from a Firestore field a client could otherwise tamper with).

import { requireAuth, getAccessToken, getUserClaims, setCustomClaims, fsMergeDoc, jsonResponse } from '../../_lib/firebaseAdmin.js';

export async function onRequestPost({ request, env }) {
  const caller = await requireAuth(request, env);
  if (!caller) return jsonResponse({ error: { message: 'You must be signed in.' } }, 401);
  if (caller.admin !== true) {
    return jsonResponse({ error: { message: 'Only existing admins can modify admin roles.' } }, 403);
  }

  try {
    const { targetUid, makeAdmin } = await request.json();
    if (typeof targetUid !== 'string' || typeof makeAdmin !== 'boolean') {
      return jsonResponse(
        { error: { message: 'Expected { targetUid: string, makeAdmin: boolean }.' } },
        400
      );
    }

    const accessToken = await getAccessToken(env);
    const existingClaims = (await getUserClaims(env, accessToken, targetUid)) || {};
    await setCustomClaims(env, accessToken, targetUid, { ...existingClaims, admin: makeAdmin });

    // Keep the old Firestore field in sync purely for display in the Admin
    // user list (Admin.jsx reads user.isAdmin to show the ADMIN badge).
    // This field must never be trusted for access control anymore.
    await fsMergeDoc(env, accessToken, 'users', targetUid, { isAdmin: makeAdmin });

    return jsonResponse({ success: true, targetUid, admin: makeAdmin });
  } catch (err) {
    return jsonResponse({ error: { message: 'Server error. Baad mein try karo.' } }, 500);
  }
}
