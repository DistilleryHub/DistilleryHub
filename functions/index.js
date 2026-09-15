const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();

// Maps a notification's "type" to the matching Settings.jsx toggle field
// (nested under users/{uid}.settings.*). Types with no dedicated toggle in
// the UI (like, comment, connection_request/accept) always send — same as
// before, just documented instead of accidentally falling through.
const PREF_KEY_MAP = {
  message: 'notifyChatMessages',
  mention: 'notifyChatMessages',
  group_add: 'notifyChatMessages',
  group_call: 'notifyChatMessages',
  job_application: 'notifyJobAlerts',
};

function buildNotifText(n) {
  const name = n.fromName || 'Someone';
  switch (n.type) {
    case 'like': return { title: 'New like', body: `${name} liked your post` };
    case 'comment': return { title: 'New comment', body: `${name} commented on your post` };
    case 'connection_request': return { title: 'Connection request', body: `${name} sent you a connection request` };
    case 'connection_accept': return { title: 'Connection accepted', body: `${name} accepted your connection request` };
    case 'message': return { title: name, body: 'Sent you a message' };
    case 'mention': return { title: name, body: 'Mentioned you in a group' };
    case 'group_add': return { title: 'Added to group', body: `${name} added you to ${n.groupName || 'a group'}` };
    case 'group_call': return { title: 'Group call', body: `${n.groupName || 'A group'} started a call` };
    case 'job_application': return { title: 'New application', body: `${name} applied to ${n.jobTitle || 'your job'}` };
    default: return { title: 'DistilleryHub', body: `${name} interacted with your activity` };
  }
}

function clickUrlFor(n) {
  if (n.convoId) return `/react-migration/?open=chat`;
  if (n.jobId) return `/react-migration/?open=jobs:${n.jobId}`;
  return `/react-migration/`;
}

exports.onNotificationCreated = onDocumentCreated(
  'notifications/{notifId}',
  async (event) => {
    const n = event.data.data();
    if (!n || !n.userId) return;

    if (n.silent === true) return;

    const userSnap = await db.collection('users').doc(n.userId).get();
    const userData = userSnap.data();
    if (!userData) return;

    const prefs = userData.settings || {};
    if (prefs.notifyPush === false) return;

    const prefKey = PREF_KEY_MAP[n.type];
    if (prefKey && prefs[prefKey] === false) return;

    const tokens = userData.fcmTokens || [];
    if (!tokens.length) return;

    const { title, body } = buildNotifText(n);
    const url = clickUrlFor(n);

    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: { url },
      webpush: { fcmOptions: { link: url } },
    });

    const badTokens = [];
    response.responses.forEach((r, i) => {
      if (!r.success) badTokens.push(tokens[i]);
    });
    if (badTokens.length) {
      await db.collection('users').doc(n.userId).update({
        fcmTokens: admin.firestore.FieldValue.arrayRemove(...badTokens),
      });
    }
  }
);

// ---- Mobile + MPIN login ----
exports.mpinLogin = require('./mpinAuth').mpinLogin;

// ---- Account deletion (30-day safety flow) ----
exports.requestAccountDeletion = require('./deleteAccount').requestAccountDeletion;
exports.confirmAccountDeletion = require('./deleteAccount').confirmAccountDeletion;
exports.cancelAccountDeletion = require('./deleteAccount').cancelAccountDeletion;
exports.dailyDeletionCheck = require('./deleteAccount').dailyDeletionCheck;

// ---------------------------------------------------------------------------
// RBAC: Admin role via Firebase Auth Custom Claims
//
// Why: Admin.jsx and Settings.jsx used to gate the admin UI on
// users/{uid}.isAdmin, a plain Firestore field. That field is only as
// secure as the Firestore rules protecting it -- if a client can ever
// write it, they can grant themselves admin. Custom claims live on the
// Auth token itself and can only be set from a trusted server (here,
// from these Cloud Functions), so Firestore rules can safely check
// request.auth.token.admin instead of trusting any document field.
// ---------------------------------------------------------------------------

/**
 * One-time migration helper: lets a user who is ALREADY marked
 * isAdmin: true in Firestore (the old, pre-claims trust model) claim
 * the equivalent admin custom claim on their own account, once.
 *
 * This exists only so the very first admin(s) can move over to the
 * new system without needing Firebase CLI / console access (you're
 * on mobile). After this, promoting anyone else must go through
 * setAdminClaim below, which requires the caller to already hold the
 * admin claim -- so this bootstrap path can't be used to escalate
 * privileges beyond what Firestore already (supposedly) granted.
 *
 * Client usage (call once per legacy admin, then discard):
 *   const bootstrap = httpsCallable(functions, 'bootstrapAdminClaimFromLegacyFlag');
 *   await bootstrap();
 *   await auth.currentUser.getIdToken(true); // force refresh so the new claim is visible
 */
exports.bootstrapAdminClaimFromLegacyFlag = onCall(async (request) => {
  const { auth } = request;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

  const userDoc = await db.collection('users').doc(auth.uid).get();
  const isLegacyAdmin = userDoc.exists && userDoc.data().isAdmin === true;

  if (!isLegacyAdmin) {
    throw new HttpsError(
      'permission-denied',
      'Your account is not marked as admin in the legacy record.'
    );
  }

  const authUser = await admin.auth().getUser(auth.uid);
  const existingClaims = authUser.customClaims || {};
  await admin.auth().setCustomUserClaims(auth.uid, { ...existingClaims, admin: true });

  return { success: true };
});

/**
 * Promote or demote another user's admin status. Only callable by
 * someone who already holds the admin custom claim (checked from
 * their verified ID token, not from Firestore).
 *
 * Client usage:
 *   const setAdminClaim = httpsCallable(functions, 'setAdminClaim');
 *   await setAdminClaim({ targetUid, makeAdmin: true });
 */
exports.setAdminClaim = onCall(async (request) => {
  const { auth, data } = request;

  if (!auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  if (auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Only existing admins can modify admin roles.');
  }

  const { targetUid, makeAdmin } = data || {};
  if (typeof targetUid !== 'string' || typeof makeAdmin !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Expected { targetUid: string, makeAdmin: boolean }.');
  }

  const targetUser = await admin.auth().getUser(targetUid);
  const existingClaims = targetUser.customClaims || {};
  await admin.auth().setCustomUserClaims(targetUid, { ...existingClaims, admin: makeAdmin });

  // Keep the old Firestore field in sync purely for display in the Admin
  // user list (Admin.jsx reads user.isAdmin to show the ADMIN badge).
  // This field must never be trusted for access control anymore --
  // that's what the custom claim + updated rules are for.
  await db.collection('users').doc(targetUid).set({ isAdmin: makeAdmin }, { merge: true });

  return { success: true, targetUid, admin: makeAdmin };
});

/**
 * Lets the client read a user's current claims right after a
 * promotion/demotion, since ID tokens cache claims client-side until
 * force-refreshed with getIdToken(true).
 */
exports.refreshMyClaims = onCall(async (request) => {
  const { auth } = request;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  const user = await admin.auth().getUser(auth.uid);
  return { claims: user.customClaims || {} };
});
