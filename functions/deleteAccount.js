const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const GMAIL_EMAIL = 'thedistillerymaster@gmail.com';
const GMAIL_APP_PASSWORD = 'whcefescunrxrmpa';
const APP_URL = 'https://distilleryhub.github.io/DistilleryHub';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: GMAIL_EMAIL, pass: GMAIL_APP_PASSWORD },
});

function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

async function sendConfirmEmail(email, name, uid, token, step) {
  const link = `${APP_URL}/confirm-delete?uid=${uid}&token=${token}`;
  await transporter.sendMail({
    from: `DistilleryHub <${GMAIL_EMAIL}>`,
    to: email,
    subject: `Account deletion confirmation (${step}/3) — DistilleryHub`,
    html: `<p>Hi ${name || ''},</p>
      <p>Yeh confirmation ${step} of 3 hai aapke DistilleryHub account delete karne ke request ke liye.</p>
      <p><a href="${link}">Yahan click karke confirm karein</a></p>
      <p>Agar yeh request aapne nahi ki, to Settings mein jaake "Cancel deletion" dabayein.</p>`,
  });
}

exports.requestAccountDeletion = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Login zaroori hai.');
  const uid = context.auth.uid;
  const userRef = db.collection('users').doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) throw new functions.https.HttpsError('not-found', 'User nahi mila.');
  const user = snap.data();

  const token = generateToken();
  const now = admin.firestore.Timestamp.now();
  const scheduledAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + 30 * 24 * 60 * 60 * 1000);

  await userRef.update({
    deletionRequested: true,
    deletionCancelled: false,
    deletionRequestedAt: now,
    deletionScheduledAt: scheduledAt,
    deletionConfirmations: 0,
    deletionToken: token,
    deletionEmailsSent: 1,
  });

  const authUser = await admin.auth().getUser(uid);
  await sendConfirmEmail(authUser.email, user.name, uid, token, 1);
  return { ok: true };
});

exports.confirmAccountDeletion = functions.https.onCall(async (data) => {
  const { uid, token } = data;
  if (!uid || !token) throw new functions.https.HttpsError('invalid-argument', 'Link invalid hai.');

  const userRef = db.collection('users').doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) throw new functions.https.HttpsError('not-found', 'User nahi mila.');
  const user = snap.data();

  if (!user.deletionRequested || user.deletionCancelled) {
    throw new functions.https.HttpsError('failed-precondition', 'Deletion request active nahi hai.');
  }
  if (user.deletionToken !== token) {
    throw new functions.https.HttpsError('permission-denied', 'Link expire ho chuka hai.');
  }

  const confirmations = (user.deletionConfirmations || 0) + 1;
  await userRef.update({ deletionConfirmations: confirmations, deletionToken: generateToken() });
  return { ok: true, confirmations };
});

exports.cancelAccountDeletion = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Login zaroori hai.');
  await db.collection('users').doc(context.auth.uid).update({
    deletionRequested: false,
    deletionCancelled: true,
    deletionConfirmations: 0,
  });
  return { ok: true };
});

exports.dailyDeletionCheck = functions.pubsub.schedule('every 24 hours').onRun(async () => {
  const now = admin.firestore.Timestamp.now();
  const snap = await db.collection('users').where('deletionRequested', '==', true).get();

  for (const docSnap of snap.docs) {
    const uid = docSnap.id;
    const user = docSnap.data();
    if (user.deletionCancelled) continue;

    const daysSince = (now.toMillis() - user.deletionRequestedAt.toMillis()) / (24 * 60 * 60 * 1000);
    const confirmations = user.deletionConfirmations || 0;
    const emailsSent = user.deletionEmailsSent || 1;

    let authUser;
    try { authUser = await admin.auth().getUser(uid); } catch { continue; }

    if (confirmations >= 1 && emailsSent < 2 && daysSince >= 10) {
      const token = generateToken();
      await docSnap.ref.update({ deletionToken: token, deletionEmailsSent: 2 });
      await sendConfirmEmail(authUser.email, user.name, uid, token, 2);
      continue;
    }
    if (confirmations >= 2 && emailsSent < 3 && daysSince >= 20) {
      const token = generateToken();
      await docSnap.ref.update({ deletionToken: token, deletionEmailsSent: 3 });
      await sendConfirmEmail(authUser.email, user.name, uid, token, 3);
      continue;
    }
    if (confirmations >= 3 && daysSince >= 30) {
      await admin.auth().deleteUser(uid).catch(() => {});
      await docSnap.ref.delete();
    }
  }
  return null;
});
