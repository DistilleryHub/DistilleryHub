import { auth, db } from './firebase-init.js';
import { postText, listenFeed } from './feed.js';
import { postStatus } from './status.js';
import { uploadFile } from './upload.js';
import { startCall } from './calling.js';

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

    // Feed Render (सुंदर कार्ड्स में)
    const feedList = document.getElementById('feedList');
    if (feedList) {
        listenFeed(posts => {
            feedList.innerHTML = posts.map(p => `
                <div class="post-card">
                    <div class="post-header">
                        <div class="post-avatar">${p.authorName ? p.authorName.charAt(0) : 'U'}</div>
                        <div><strong>${p.authorName || 'Member'}</strong></div>
                    </div>
                    <div class="post-body">${p.text || ''}</div>
                    ${p.imageURL ? `<img class="post-image" src="${p.imageURL}" alt="Post Image">` : ''}
                </div>
            `).join('');
        });
    }
});
