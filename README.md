# DistilleryHub — Call & Rate-Limit Fix

## Files in this zip

- `Chat.jsx` — replaces your existing `Chat.jsx`. Only change: `sendRawMessage`
  no longer blames every `permission-denied` on "sending too fast".
- `firestore.indexes.json` — merge into your existing indexes file (or use
  as-is if you don't have one yet).
- `README-FIX.md` — this file.

`CallContext.js` and `firestore.rules` did **not** need code changes — the
call-connection problem was missing indexes only.

---

## 1. Deploy the two missing composite indexes

These were causing `failed-precondition` errors and silently breaking:
- the Calls tab history (`calls` collection query)
- WebRTC signal exchange, i.e. offer/answer/ICE candidates never arriving
  (`calls/{callId}/signals` collection group query) — this is why remote
  video/audio never showed up on one side of a call.

**Option A — merge the file:**
If you already have a `firestore.indexes.json`, add the two objects from
the `indexes` array in this zip's `firestore.indexes.json` into your
existing array (don't overwrite the whole file if you have other indexes
in it already). Then:

```bash
firebase deploy --only firestore:indexes
```

**Option B — click the links:**
Open the browser console during a call / on the Calls tab, find the two
`FirebaseError: ... The query requires an index ... https://console.firebase.google.com/...`
lines, and open each link. Click "Create Index" on each. Takes 2-5 minutes
per index to finish building (status shows in Firebase Console → Firestore
→ Indexes).

You need **both** — one for `calls`, one for `signals`. Missing either one
leaves the corresponding feature broken.

---

## 2. Replace `Chat.jsx`

Swap in the `Chat.jsx` from this zip. The only functional change is in
`sendRawMessage`:

- Added a `lastMessageSentAtRef` (near the other `useRef`s at the top of
  the component).
- The `catch` block now only shows "You're sending messages too fast" when
  the send actually landed under 700ms after the last successful one.
  Otherwise it shows "Message couldn't be sent — you may be blocked, or
  this person only accepts messages from their connections." — which is
  almost certainly what was actually happening when you saw the popup
  during normal-speed typing.

No changes needed to `firestore.rules` — the rule logic was already
correct, the client just couldn't tell which of its clauses had failed.

---

## 3. `NotAllowedError: Permission denied` (camera/mic)

Not fixed in this zip — it's not a bug in the shared files. It's the
browser/WebView denying `getUserMedia`. Most likely causes, in order of
likelihood given your stack:

1. **If the app is wrapped in a custom Android WebView (not a plain TWA):**
   by default Android's WebView denies all `getUserMedia` requests unless
   the host `Activity` overrides `WebChromeClient.onPermissionRequest()`
   to grant `PermissionRequest.RESOURCE_VIDEO_CAPTURE` /
   `RESOURCE_AUDIO_CAPTURE`. If you share the Android wrapper code
   (`MainActivity`), I can give you the exact fix.
2. Site-level camera/mic permission denied in the browser (check the
   padlock icon next to the URL).
3. Testing inside a devtools/preview iframe that doesn't have
   `allow="camera; microphone"` in its permissions policy.

Fix indexes + Chat.jsx first, then retest calls — if `NotAllowedError`
still shows up, send the Android wrapper code (if any) and I'll patch that
too.
