# chat-features-mvp

This branch/dir contains Phase‑1 client-side chat feature implementations and instructions.

Files included:
- chat-features-mvp/chat-features.js  — client script implementing voice recorder capture, robust sendMessage, quick responses menu, subject input, video attach helper, and mobile CSS tweaks.

How to deploy
1. Checkout branch `fix/chat-features-mvp`.
2. Add this script to `index_fixed.html` before the closing `</body>` tag:

```html
<script src="/chat-features-mvp/chat-features.js"></script>
```

3. Ensure the following globals / helpers exist in the page (they are present in the existing index_fixed.html):
- `db`, `currentUser`, `serverTimestamp`, `collection`, `addDoc`, `getDocs` (Firestore helpers)
- `uploadToCloudinary(file)` and `uploadRawToCloudinary(blob, filename)` (upload helpers)
- UI elements with IDs: `chatInput`, `chatImgInput`, `btnSendMsg`, `btnVoiceMsg`, `voiceRecordIndicator`.

4. Test voice recording, sending text, image & video attachments, and quick responses.

Notes
- This script is intentionally defensive: if certain globals are missing it will surface alerts/errors. It is written to integrate with the existing single-file app without requiring a full refactor.
- For scheduled messages and Calendar integration, server-side components (Cloud Functions) are required; those are Phase‑2.
