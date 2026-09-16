// functions/api/admin/bootstrap-claim.js
// Replaces exports.bootstrapAdminClaimFromLegacyFlag from index.js.
// Route: POST /api/admin/bootstrap-claim   (Authorization: Bearer <idToken>)
//
// One-time migration helper: lets a user who is ALREADY marked
// isAdmin: true in Firestore (the old, pre-claims trust model) claim
// the equivalent admin custom claim on their own account, once.
// After this, promoting anyone else must go through set-claim.js, which
// requires the caller to already hold the admin claim — so this bootstrap
// path can't be used to escalate privileges beyond what Firestore already
// (supposedly) granted.

import { requireAuth, getAccessToken, fsGetDoc, getUserClaims, setCustomClaims, jsonResponse } from '../../_lib/firebaseAdmin.js';

export async function onRequestPost({ request, env }) {
  const user = await requireAuth(request, env);
  if (!user) return jsonResponse({ error: { message: 'You must be signed in.' } }, 401);

  try {
    const accessToken = await getAccessToken(env);
    const userData = await fsGetDoc(env, accessToken, 'users', user.uid);
    const isLegacyAdmin = !!userData && userData.isAdmin === true;

    if (!isLegacyAdmin) {
      return jsonResponse(
        { error: { message: 'Your account is not marked as admin in the legacy record.' } },
        403
      );
    }

    const existingClaims = (await getUserClaims(env, accessToken, user.uid)) || {};
    await setCustomClaims(env, accessToken, user.uid, { ...existingClaims, admin: true });

    return jsonResponse({ success: true });
  } catch (err) {
    return jsonResponse({ error: { message: 'Server error. Baad mein try karo.' } }, 500);
  }
}
