/**
 * ⚠️ REQUIRES SERVER — run this ONCE, manually, with your Firebase service
 * account credentials. Not part of the deployed functions (not exported
 * from index.js) — it's a standalone admin script.
 *
 * Why: before this fix, mpinHash lived on users/{uid}, which any signed-in
 * user could read. This script copies every existing mpinHash into the
 * protected userSecrets/{uid} collection, then strips it off the public
 * users/{uid} doc.
 *
 * How to run:
 *   cd functions
 *   npm install
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json node migrate-mpin-once.js
 *
 * Safe to re-run: it skips users that don't have a mpinHash left to migrate.
 */
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

async function migrate() {
  const usersSnap = await db.collection('users').get();
  let migrated = 0;

  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data();
    if (!data.mpinHash) continue;

    const batch = db.batch();
    batch.set(
      db.collection('userSecrets').doc(userDoc.id),
      { mpinHash: data.mpinHash, failedAttempts: 0, lockedUntil: null },
      { merge: true }
    );
    batch.update(userDoc.ref, {
      mpinHash: admin.firestore.FieldValue.delete(),
    });
    await batch.commit();
    migrated++;
    console.log(`Migrated ${userDoc.id}`);
  }

  console.log(`Done. Migrated ${migrated} user(s).`);
}

migrate().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
