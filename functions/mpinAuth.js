const functions = require('firebase-functions');
const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');

if (!admin.apps.length) admin.initializeApp();

exports.mpinLogin = functions.https.onCall(async (data) => {
  const { mobile, mpin } = data;
  if (!mobile || !mpin) {
    throw new functions.https.HttpsError('invalid-argument', 'Mobile number aur MPIN dono chahiye.');
  }

  const snap = await admin.firestore()
    .collection('users')
    .where('mobile', '==', mobile)
    .limit(1)
    .get();

  if (snap.empty) {
    throw new functions.https.HttpsError('not-found', 'Is mobile number se koi account nahi mila.');
  }

  const userDoc = snap.docs[0];
  const userData = userDoc.data();

  if (!userData.mpinHash) {
    throw new functions.https.HttpsError('failed-precondition', 'Is account ke liye MPIN set nahi hai.');
  }

  const match = bcrypt.compareSync(mpin, userData.mpinHash);
  if (!match) {
    throw new functions.https.HttpsError('permission-denied', 'Galat MPIN.');
  }

  const token = await admin.auth().createCustomToken(userDoc.id);
  return { token };
});
