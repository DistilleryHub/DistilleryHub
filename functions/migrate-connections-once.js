/**
 * ⚠️ REQUIRES SERVER — run this ONCE, manually, with your Firebase service
 * account credentials. Not part of the deployed functions (not exported
 * from index.js) — it's a standalone admin script.
 *
 * Why: connections/{connId} used to use addDoc's random ID. Network.jsx and
 * Profile.jsx's sendRequest() now write to a deterministic ID instead
 * (sorted "uidA_uidB") so firestore.rules' canMessage()/isConnected() can
 * look a pair up with get() (rules can't run the where('from'/'to', ==, uid)
 * queries the client uses). Connections created before that change still
 * sit at their old random ID and won't be found by that lookup — this
 * script copies each one to its correct deterministic ID and removes the
 * old doc.
 *
 * How to run:
 *   cd functions
 *   npm install
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json node migrate-connections-once.js
 *
 * Safe to re-run: it skips docs whose ID already matches the deterministic
 * scheme (it only touches docs that don't yet look like "uidA_uidB").
 */
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

function deterministicId(a, b) {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

async function migrate() {
  const snap = await db.collection('connections').get();
  let migrated = 0, skipped = 0, mergedDupes = 0;

  for (const oldDoc of snap.docs) {
    const data = oldDoc.data();
    if (!data.from || !data.to) { skipped++; continue; }

    const targetId = deterministicId(data.from, data.to);
    if (oldDoc.id === targetId) { skipped++; continue; } // already migrated

    const targetRef = db.collection('connections').doc(targetId);
    const targetSnap = await targetRef.get();

    if (targetSnap.exists) {
      // Duplicate pair under two different old random IDs (shouldn't happen
      // in normal use, since the UI only lets you send one request per
      // pair, but data can drift). Keep whichever is 'accepted', else keep
      // the newer one; drop the loser.
      const existing = targetSnap.data();
      const keepExisting =
        existing.status === 'accepted' && data.status !== 'accepted'
          ? true
          : data.status === 'accepted' && existing.status !== 'accepted'
          ? false
          : (existing.createdAt?.toMillis?.() || 0) >= (data.createdAt?.toMillis?.() || 0);

      if (!keepExisting) {
        await targetRef.set(data);
      }
      await oldDoc.ref.delete();
      mergedDupes++;
      console.log(`Merged duplicate ${oldDoc.id} -> ${targetId} (kept ${keepExisting ? 'existing' : 'this one'})`);
      continue;
    }

    const batch = db.batch();
    batch.set(targetRef, data);
    batch.delete(oldDoc.ref);
    await batch.commit();
    migrated++;
    console.log(`Migrated ${oldDoc.id} -> ${targetId}`);
  }

  console.log(`Done. Migrated ${migrated}, merged ${mergedDupes} duplicate(s), skipped ${skipped} (already fine).`);
}

migrate().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
