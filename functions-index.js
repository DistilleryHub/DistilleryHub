const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();

// Maps a notification's "type" to the matching Settings.jsx toggle field
// (nested under users/{uid}.settings.*). Types with no dedicated toggle in
// the UI (like, comment, connection_request/accept, group_add, mention,
// rfq_quote/rfq_accepted) always send — same as before, just documented
// instead of accidentally falling through. Add a line here whenever a new
// notification type should respect one of the Settings toggles.
const PREF_KEY_MAP = {
  message: 'notifyChatMessages',
  mention: 'notifyChatMessages',
  group_add: 'notifyChatMessages',
  group_call: 'notifyChatMessages',
  job_application: 'notifyJobAlerts',
  rfq_quote: 'notifyMarketLeads',
  rfq_accepted: 'notifyMarketLeads',
};

// Every notification created client-side (via notify() in notify.js) already
// carries the exact text to show, in n.message — so we use that directly for
// the push title/body instead of re-deriving it. buildNotifText() below is
// only a fallback for older/unusual docs that have no n.message.
function buildNotifText(n) {
  if (n.message) {
    return { title: n.fromUserName || 'DistilleryHub', body: n.message };
  }
  const name = n.fromUserName || n.fromName || 'Someone';
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

// Notifications created client-side (via notify.js) already carry the exact
// in-app route in n.link — use that first. The chatId/jobId fallbacks below
// only cover older docs that predate the link field.
function clickUrlFor(n) {
  if (n.link) return `/react-migration${n.link}`;
  if (n.chatId) return `/react-migration/chat`;
  if (n.jobId) return `/react-migration/jobs`;
  return `/react-migration/`;
}

exports.onNotificationCreated = onDocumentCreated(
  'notifications/{notifId}',
  async (event) => {
    const n = event.data.data();
    if (!n || !n.userId && !n.toUserId) return;
    const toUserId = n.toUserId || n.userId;

    // Respect chat mute (per-conversation "silent" flag set by the client)
    if (n.silent === true) return;

    // Respect the recipient's notification settings. The client (Settings.jsx)
    // writes these under users/{uid}.settings.*, not a top-level notifPrefs
    // field — reading the wrong field used to mean these toggles were fully
    // decorative and never actually stopped a push from going out.
    const userSnap = await db.collection('users').doc(toUserId).get();
    const userData = userSnap.data();
    if (!userData) return;

    const prefs = userData.settings || {};
    if (prefs.notifyPush === false) return; // user turned off push entirely

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

    // Clean up dead/expired tokens so they stop being tried
    const badTokens = [];
    response.responses.forEach((r, i) => {
      if (!r.success) badTokens.push(tokens[i]);
    });
    if (badTokens.length) {
      await db.collection('users').doc(toUserId).update({
        fcmTokens: admin.firestore.FieldValue.arrayRemove(...badTokens),
      });
    }
  }
);
