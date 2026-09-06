# Production Readiness — DistilleryHub

Two lists: what's been done for you in this project, and what you must still
do yourself (things that require your own accounts/credentials/decisions,
which nobody can do on your behalf).

## ✅ Done for you in this project

- **Switched to the `distilleryhub-b1d2d` Firebase project** (matches the
  DistilleryHub name) in both `index.html` and `firebase-messaging-sw.js`,
  plus a `.firebaserc` so `firebase deploy` targets it automatically.
- **TURN server wired up** with real Metered.ca credentials
  (`distilleryhub` project) — calling should now work reliably across
  most networks. Free tier is capped at 500MB/month; watch usage in the
  Metered dashboard.
- **Sentry error monitoring wired up** with your real Loader Script
  (DSN embedded server-side by Sentry, nothing else to configure).
- **Firestore + Storage security rules** written to match every real
  read/write in the app (`firebase/firestore.rules`, `firebase/storage.rules`).
- **Automated rules tests** (`firebase/tests/`) covering the highest-risk
  permission boundaries.
- **Server-side rate limiting** (`functions/index.js`) — silently drops
  runaway spam beyond a sane per-user threshold.
- **Privacy Policy + Terms of Service** drafts, linked from the footer.
- Correct `functions/` + `firebase/` folder layout matching `firebase.json`.

## 🟠 Because this is a brand-new, empty Firebase project

`distilleryhub-b1d2d` has never been deployed to before, so these one-time
setup steps (that the old project already had) need to be done in the
Firebase Console before your first deploy:

1. **Upgrade to the Blaze (pay-as-you-go) plan.** Project settings
   currently shows "Spark — No cost ($0/month)". Cloud Functions (push
   notifications, SEO rendering, sitemap, rate limiting) **will not
   deploy at all** on the free Spark plan — this is the #1 thing to fix
   before anything else. Project Overview → ⚙️ (top left) → Usage and
   billing → Modify plan.
2. **Enable Authentication providers.** Console → Build → Authentication
   → Get started → enable **Email/Password** and **Google** (whichever
   the app uses — check the sign-in screen).
3. **Create the Firestore database.** Console → Build → Firestore
   Database → Create database → pick a region close to your users →
   Native mode (not Datastore mode).
4. **Enable Storage.** Console → Build → Storage → Get started.

Only after these 4 are done will `firebase deploy` succeed.

## 🔴 You still need to do these — nothing works without them

1. **Set the FCM VAPID key** (for the `distilleryhub-b1d2d` project — the
   old project's key, if you generated one before, won't work here). In
   `index.html`, find `FCM_VAPID_KEY = "PASTE_YOUR_VAPID_KEY_HERE"` and
   replace it with the real key from Firebase Console (make sure
   `distilleryhub-b1d2d` is the selected project) → Project Settings →
   Cloud Messaging → Web Push certificates. Without this, push
   notifications silently do nothing.

2. **Run the Firestore rules tests against the emulator** before your
   first deploy, and again any time you touch `firestore.rules`:
   ```
   cd firebase/tests
   npm install
   npm test
   ```
   (Requires the Firebase CLI: `npm install -g firebase-tools`.)

3. **Check your Cloudinary plan.** `CLOUDINARY_CLOUD_NAME` /
   `CLOUDINARY_UPLOAD_PRESET` are already set to a real account — confirm
   its free-tier bandwidth/storage limits are enough for your expected
   traffic before launch, or upgrade.

4. **Fill in the placeholders in `privacy.html` and `terms.html`**
   ([DATE], governing-law jurisdiction) and have a lawyer review both
   before publishing — they're solid drafts, not final legal documents.

## 🟡 Recommended, not blocking

- **Watch Metered TURN usage** — the free tier is 500MB/month; check
  usage in the Metered dashboard as real traffic grows and upgrade the
  plan before it's exceeded (calls degrade, not crash, when it runs out —
  but best not to find out during a live demo).
- **Group call scale**: the mesh WebRTC group calling works well for
  small groups (~4-6 people). Beyond that, video quality degrades because
  every participant uploads to every other participant directly. If you
  expect larger group calls, you'd eventually want an SFU (e.g. LiveKit,
  Jitsi) instead — a bigger project, not needed to launch.
- **Load-test** the app with a realistic number of concurrent users
  before a big launch, especially chat/calling.
- Consider a separate staging Firebase project (distinct from
  `distilleryhub-b1d2d`) so you can test changes safely without touching
  production data.

## Deploy command reference

```
firebase deploy --only firestore:rules,storage:rules,functions,hosting
```

See `DEPLOYMENT-CHECKLIST.md` for the full step-by-step.
