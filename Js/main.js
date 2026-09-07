import { auth, db } from './firebase-init.js';
import { postText, listenFeed } from './feed.js';
import { postStatus } from './status.js';
import { uploadFile } from './upload.js';
import { startCall } from './calling.js';
import { sendMessage, listenMessages } from './chat.js';

window.addEventListener('load', () => {
    // Post बटन
    const btnPost = document.getElementById('btnPost');
    if (btnPost) btnPost.addEventListener('click', async () => {
        const text = document.getElementById('postText').value.trim();
        const imgInput = document.getElementById('postImgInput');
        const file = imgInput && imgInput.files[0];
        if (!text && !file) return alert('कुछ लिखो या फोटो चुनो');
        
        let imageURL = '';
        if (file) {
            try { imageURL = await uploadFile(file); } 
            catch (e) { return alert('Upload failed: ' + e.message); }
        }
        await postText(text, imageURL);
        document.getElementById('postText').value = '';
        if (imgInput) imgInput.value = '';
    });

    // Chat मैसेज भेजना (अब फोटो अटैच के साथ)
    window.sendChatMessage = async function() {
        const input = document.getElementById('chatInput');
        const text = input.value.trim();
        const fileInput = document.getElementById('chatImgInput');
        const file = fileInput && fileInput.files[0];
        
        // अगर कुछ नहीं है तो रुक जाओ
        if (!text && !file) return;

        let imageURL = '';
        if (file) {
            try { imageURL = await uploadFile(file); }
            catch (e) { return alert('Image upload failed: ' + e.message); }
        }

        if (!window.currentConvoId) return alert('पहले चैट सेलेक्ट करो');
        
        await sendMessage(window.currentConvoId, text, imageURL);
        input.value = '';
        if (fileInput) fileInput.value = ''; // इनपुट साफ करो
    };

    // फोटो अटैच बटन (chat में "+" बटन)
    const btnAttach = document.getElementById('btnChatAttach');
    if (btnAttach) btnAttach.addEventListener('click', () => {
        document.getElementById('chatImgInput').click();
    });

    // Status बटन
    const btnStatus = document.getElementById('btnSubmitStatus');
    if (btnStatus) btnStatus.addEventListener('click', async () => {
        const text = document.getElementById('statusText').value.trim();
        const imgInput = document.getElementById('statusImgInput');
        const file = imgInput && imgInput.files[0];
        if (!text && !file) return;
        
        let imageURL = '';
        if (file) {
            try { imageURL = await uploadFile(file); } 
            catch (e) { return alert('Upload failed'); }
        }
        await postStatus(text, imageURL);
        alert('Status post ho gaya!');
    });

    // Call बटन
    const btnCall = document.getElementById('btnStartCall');
    if (btnCall) btnCall.addEventListener('click', () => {
        const otherUid = document.getElementById('callTargetUid').value;
        if (otherUid) startCall(otherUid, 'audio');
    });

    // Feed सुनना
    listenFeed(posts => console.log('Posts:', posts));
});
