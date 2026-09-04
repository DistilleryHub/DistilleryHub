# Cloud Function: deliverScheduledMessages

This Cloud Function queries the `scheduledMessages` collection for documents with `status: 'scheduled'` and `scheduledFor <= now`, and writes the contained payload to `conversations/{convoId}/messages`.

Deploy
1. Install Firebase CLI and login:
   - npm install -g firebase-tools
   - firebase login
2. In the repo root run:
   - cd chat-features-mvp/functions
   - npm install
3. Deploy the function (from repo root):
   - firebase deploy --only functions:deliverScheduledMessages

Notes
- This function uses a pubsub schedule (Cloud Scheduler). Confirm billing & scheduler API enabled in the Firebase project.
- scheduledMessages document shape example:
  {
    conversationId: "CONVO_ID",
    payload: { senderUid: "UID", text: "Hello at 9am", messageType: 'text' },
    scheduledFor: Timestamp,
    status: 'scheduled',
    createdAt: Timestamp
  }

- The function marks scheduled message doc status to 'sent' or 'failed' with timestamps.
