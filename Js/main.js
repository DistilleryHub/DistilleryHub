import { auth, db, startCall } from './firebase-init.js';
import { postText, listenFeed } from './feed.js';
import { postStatus } from './status.js';

window.addEventListener('load', () => {
    // Post button
    if (document.getElementById('btnPost')) {
        document.getElementById('btnPost').addEventListener('click', async () => {
            const text = document.getElementById('postText').value.trim();
            if (text) { await postText(text); document.getElementById('postText').value = ''; }
        });
    }
    // Status button
    if (document.getElementById('btnSubmitStatus')) {
        document.getElementById('btnSubmitStatus').addEventListener('click', async () => {
            const text = document.getElementById('statusText').value.trim();
            if (text) { await postStatus(text); }
        });
    }
    // Call button
    if (document.getElementById('btnStartCall')) {
        document.getElementById('btnStartCall').addEventListener('click', () => {
            const otherUid = document.getElementById('callTargetUid').value;
            if (otherUid) startCall(otherUid, 'audio');
        });
    }
    // Listen to posts
    listenFeed((posts) => {
        console.log('Posts loaded:', posts);
    });
});
