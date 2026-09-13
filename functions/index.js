const { onDocumentCreated } = require('firebase-functions/v2/firestore');
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
