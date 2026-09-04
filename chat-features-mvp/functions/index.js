// index.js — Cloud Function to deliver scheduled messages
// Deploy with: firebase deploy --only functions:deliverScheduledMessages

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

// Runs every minute (use Cloud Scheduler frequency as needed)
exports.deliverScheduledMessages = functions.pubsub.schedule('every 1 minutes').onRun(async (context) => {
  const now = admin.firestore.Timestamp.now();
  const dueQ = db.collection('scheduledMessages')
    .where('status','==','scheduled')
    .where('scheduledFor','<=', now)
    .orderBy('scheduledFor')
    .limit(50);
  const snap = await dueQ.get();
  if(snap.empty) return null;

  const results = [];
  for(const doc of snap.docs){
    const data = doc.data();
    const id = doc.id;
    try{
      const convoId = data.conversationId;
      const payload = data.payload || {};
      // add serverTimestamp if not present
      payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
      const msgRef = await db.collection('conversations').doc(convoId).collection('messages').add(payload);
      await doc.ref.update({ status: 'sent', deliveredAt: admin.firestore.FieldValue.serverTimestamp(), msgId: msgRef.id });
      results.push({ id, status: 'sent' });
    }catch(err){
      console.error('scheduled send failed', id, err);
      try{ await doc.ref.update({ status: 'failed', lastError: String(err), lastAttemptAt: admin.firestore.FieldValue.serverTimestamp() }); }catch(e){ console.error('failed to mark scheduled message', e); }
      results.push({ id, status: 'failed' });
    }
  }
  return { processed: results.length };
});
