import { uploadFile } from './upload.js';
import { auth, db, startCall } from './firebase-init.js';
import { postText, listenFeed } from './feed.js';
import { postStatus } from './status.js';
import { sendMessage, listenMessages } from './chat.js';
import { uploadFile } from './upload.js';
import { startCall as startCallSignal } from './calling.js';

window.addEventListener('load', () => {
    // ===== Post Button (Text + Image) =====
    const btnPost = document.getElementById('btnPost');
    if (btnPost) {
        btnPost.addEventListener('click', async () => {
            const text = document.getElementById('postText').value.trim();
            const imgInput = document.getElementById('postImgInput');
            const file = imgInput && imgInput.files[0];

            if (!text && !file) { alert('कुछ लिखो या फोटो चुनो'); return; }

            let imageURL = '';
            if (file) {
                try {
                    imageURL = await uploadFile(file);
                } catch (err) {
                    alert('Image upload failed: ' + err.message);
                    return;
                }
            }

            try {
                await postText(text, imageURL);
                document.getElementById('postText').value = '';
                if (imgInput) imgInput.value = '';
                alert('Post ho gaya!');
            } catch (err) {
                alert('Post error: ' + err.message);
            }
        });
    }

    // ===== Status Button (Text + Image) =====
    const btnStatus = document.getElementById('btnSubmitStatus');
    if (btnStatus) {
        btnStatus.addEventListener('click', async () => {
            const text = document.getElementById('statusText').value.trim();
            const imgInput = document.getElementById('statusImgInput');
            const file = imgInput && imgInput.files[0];

            let imageURL = '';
            if (file) {
                try {
                    imageURL = await uploadFile(file);
                } catch (err) { alert('Image upload failed'); return; }
            }

            try {
                await postStatus(text, imageURL);
                alert('Status post ho gaya!');
            } catch (err) {
                alert('Status error: ' + err.message);
            }
        });
    }

    // ===== Call Button =====
    const btnCall = document.getElementById('btnStartCall');
    if (btnCall) {
        btnCall.addEventListener('click', async () => {
            const otherUid = document.getElementById('callTargetUid').value;
            if (otherUid) {
                const result = await startCallSignal(otherUid, 'audio');
                if (result) alert('Call started...');
            }
        });
    }

    // ===== Feed Listen =====
    listenFeed((posts) => {
        console.log('Posts:', posts);
    });
});
