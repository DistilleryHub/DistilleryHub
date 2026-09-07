import { auth, db } from './firebase-init.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { postText, listenFeed } from './feed.js';
import { postStatus } from './status.js';
import { uploadFile } from './upload.js';
import { startCall } from './calling.js';
import { sendMessage } from './chat.js';

window.addEventListener('load', () => {
    // --- FEED POST ---
    const btnPost = document.getElementById('btnPost');
    if (btnPost) btnPost.addEventListener('click', async () => {
        const text = document.getElementById('postText').value.trim();
        const imgInput = document.getElementById('postImgInput');
        const file = imgInput && imgInput.files[0];
        if (!text && !file) return alert('कुछ लिखो या फोटो चुनो');
        let imageURL = '';
        if (file) {
            try { imageURL = await uploadFile(file); } catch (e) { return alert('फोटो अपलोड फेल: ' + e.message); }
        }
        await postText(text, imageURL);
        document.getElementById('postText').value = '';
        if (imgInput) imgInput.value = '';
    });

    // --- CHAT "➕" BATTON ----
    const btnAttach = document.getElementById('btnChatAttach');
    if (btnAttach) {
        btnAttach.addEventListener('click', () => {
            document.getElementById('chatImgInput').click();
        });
    }

    // --- SEND CHAT MESSAGE (Text + Photo) ---
    window.sendChatMessage = async function() {
        const input = document.getElementById('chatInput');
        const text = input.value.trim();
        const fileInput = document.getElementById('chatImgInput');
        const file = fileInput && fileInput.files[0];

        if (!text && !file) return;
        if (!window.currentConvoId) return alert('पहले चैट सेलेक्ट करो');

        let imageURL = '';
        if (file) {
            try { imageURL = await uploadFile(file); } 
            catch (e) { return alert('फोटो अपलोड फेल: ' + e.message); }
        }

        await sendMessage(window.currentConvoId, text, imageURL);
        input.value = '';
        if (fileInput) fileInput.value = '';
    };

    // --- STATUS ---
    const btnStatus = document.getElementById('btnSubmitStatus');
    if (btnStatus) btnStatus.addEventListener('click', async () => {
        const text = document.getElementById('statusText').value.trim();
        if (!text) return;
        await postStatus(text);
        document.getElementById('statusText').value = '';
        alert('Status posted!');
    });

    // --- CALL ---
    const btnCall = document.getElementById('btnStartCall');
    if (btnCall) btnCall.addEventListener('click', () => {
        const otherUid = document.getElementById('callTargetUid').value;
        if (otherUid) startCall(otherUid, 'audio');
    });

    // --- LISTEN TO FEED ---
    listenFeed(posts => console.log('Posts:', posts));
});
