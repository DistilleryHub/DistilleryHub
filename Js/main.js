import { auth, db, startCall } from './firebase-init.js';
import { postText, listenFeed } from './feed.js';
import { postStatus } from './status.js';
import { sendMessage, listenMessages } from './chat.js';
import { uploadFile } from './upload.js';

window.addEventListener('load', () => {
    // ===== Post Button =====
    if (document.getElementById('btnPost')) {
        document.getElementById('btnPost').addEventListener('click', async () => {
            const text = document.getElementById('postText').value.trim();
            if (text) { await postText(text); document.getElementById('postText').value = ''; }
        });
    }

    // ===== Status Button =====
    if (document.getElementById('btnSubmitStatus')) {
        document.getElementById('btnSubmitStatus').addEventListener('click', async () => {
            const text = document.getElementById('statusText').value.trim();
            if (text) { await postStatus(text); }
        });
    }

    // ===== Call Button =====
    if (document.getElementById('btnStartCall')) {
        document.getElementById('btnStartCall').addEventListener('click', () => {
            const otherUid = document.getElementById('callTargetUid').value;
            if (otherUid) startCall(otherUid, 'audio');
        });
    }

    // ===== Test Chat (अभी टेस्ट के लिए) =====
    // जब चैट खुले, तो मैसेज लोड करें (convoId की जगह असली ID डालें)
    listenMessages('test123', (msgs) => {
        console.log('Messages loaded:', msgs);
    });

    // ===== Listen to Feed (पोस्ट देखना) =====
    listenFeed((posts) => {
        console.log('Posts loaded:', posts);
        // यहाँ आप अपना पोस्ट render करने का कोड डाल सकते हैं
    });
});
