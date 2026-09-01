# Deployment checklist — DistilleryHub (V23)

## Already done for you
- Firebase Auth (email/password + Google), Firestore rules, Cloudinary uploads
- Feed, Network, Jobs, Articles, Learning, real-time Chat
- Comments, Likes, Connections, Notifications (in-app), Block/Report, Admin panel
- Cloud Functions written for: push notifications, SEO server-rendering of job/article
  pages, and a dynamic sitemap

## One-time setup you need to do

### 1. Firebase Authentication
Firebase Console → Authentication → Sign-in method → enable **Email/Password**
and **Google**.

### 2. Upgrade to the Blaze (pay-as-you-go) plan
Cloud Functions require Blaze. Firebase Console → bottom-left → "Upgrade".
Blaze has a generous free tier — a network this size will very likely stay
within it, but it does require a billing card on file.

### 3. Install the Firebase CLI (once, on your computer)
```
npm install -g firebase-tools
firebase login
```

### 4. Deploy Firestore rules
```
firebase deploy --only firestore:rules
```
(`--config` points at `firebase.json`, which lives inside the `firebase/`
folder in this package rather than the project root.)

### 5. Install and deploy Cloud Functions
```
cd functions
npm install
cd ..
firebase deploy --only functions
```

### 6. Generate a Web Push (VAPID) key for push notifications
Firebase Console → Project settings → Cloud Messaging → **Web configuration**
→ "Web Push certificates" → **Generate key pair**. Copy the key, then open
`index.html` and replace:
```
const FCM_VAPID_KEY = "PASTE_YOUR_VAPID_KEY_HERE";
```
with the copied key. Until this is filled in, push notifications stay
silently disabled — everything else in the app works normally.

### 7. Deploy Hosting (the app itself + SSR rewrites)
```
firebase deploy --only hosting
```
This activates:
- `/jobs/{id}` and `/articles/{id}` → server-rendered, crawlable pages
  (proper title/description/OG tags + real text content for Google,
  WhatsApp, LinkedIn, Twitter previews)
- `/sitemap.xml` → regenerated live from Firestore on every request

### 8. Make yourself an admin (optional)
Firebase Console → Firestore → `users` → your own document → add field
`isAdmin` = `true` (boolean). This unlocks the **Admin** tab (reports queue)
for your account only. Nobody can grant this to themselves from the app.

### 9. Full deploy (all of the above in one command, after steps 1–3, 6)
```
firebase deploy
```

## Notes
- Push notifications only reach a browser that has granted notification
  permission and kept at least one tab open once to register — this is
  normal browser/PWA behaviour, not a bug.
- The old static `sitemap.xml` file was removed from this package on
  purpose: Firebase Hosting serves a static file before it ever checks
  rewrites, so keeping it would have silently blocked the new dynamic
  sitemap function from running.
