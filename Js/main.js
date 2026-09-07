import { auth, db } from './firebase-init.js';
import { collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot, doc, setDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { postText, listenFeed } from './feed.js';
import { postStatus } from './status.js';
import { uploadFile } from './upload.js';
import { startCall } from './calling.js';
import { sendMessage, listenMessages } from './chat.js';

window.addEventListener('load', () => {
    // === TAB SWITCHING ===
    window.switchTab = function(tab) {
        document.querySelectorAll('.panel').forEach(p => p.style.display = 'none');
        document.getElementById('panel-' + tab).style.display = 'block';
    };

    // === AUTH ===
    window.handleSignIn = async function() {
        const email = document.getElementById('signinEmail').value;
        const password = document.getElementById('signinPassword').value;
        const { signInWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
        try {
            await signInWithEmailAndPassword(auth, email, password);
            document.getElementById('authScreen').style.display = 'none';
            document.getElementById('app').style.display = 'block';
            loadAllData();
        } catch (e) { alert('Login Failed: ' + e.message); }
    };

    window.handleGoogleSignIn = async function() {
        const { GoogleAuthProvider, signInWithPopup } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
        try {
            await signInWithPopup(auth, new GoogleAuthProvider());
            document.getElementById('authScreen').style.display = 'none';
            document.getElementById('app').style.display = 'block';
            loadAllData();
        } catch (e) { alert('Login Failed: ' + e.message); }
    };

    window.handleSignOut = async function() {
        const { signOut } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
        await signOut(auth);
        document.getElementById('app').style.display = 'none';
        document.getElementById('authScreen').style.display = 'block';
    };

    // === PROFILE EDIT ===
    window.openProfile = async function(uid) {
        if (!uid) uid = auth.currentUser.uid;
        const p = (await getDoc(doc(db, 'users', uid))).data();
        const newName = prompt('Enter name:', p.name || '');
        const newHeadline = prompt('Enter headline:', p.headline || '');
        if (newName) await updateDoc(doc(db, 'users', uid), { name: newName, headline: newHeadline });
        loadAllData();
    };

    // === POST (Feed) ===
    const btnPost = document.getElementById('btnPost');
    if (btnPost) btnPost.addEventListener('click', async () => {
        const text = document.getElementById('postText').value.trim();
        const fileInput = document.getElementById('postImgInput');
        const file = fileInput && fileInput.files[0];
        if (!text && !file) return alert('कुछ लिखो या फोटो चुनो');
        let imageURL = '';
        if (file) { imageURL = await uploadFile(file); }
        await postText(text, imageURL);
        document.getElementById('postText').value = '';
        if (fileInput) fileInput.value = '';
    });

    // === CHAT (Send) ===
    window.sendChatMessage = async function() {
        const input = document.getElementById('chatInput');
        const text = input.value.trim();
        const fileInput = document.getElementById('chatImgInput');
        const file = fileInput && fileInput.files[0];
        if (!text && !file) return;
        if (!window.currentConvoId) return alert('पहले चैट सेलेक्ट करो');
        let imageURL = '';
        if (file) { imageURL = await uploadFile(file); }
        await sendMessage(window.currentConvoId, text, imageURL);
        input.value = '';
        if (fileInput) fileInput.value = '';
    };

    // === JOBS ===
    window.postJob = async function() {
        const title = prompt('Job Title:');
        const company = prompt('Company:');
        if (!title || !company) return;
        await addDoc(collection(db, 'jobs'), { title, company, postedByUid: auth.currentUser.uid, createdAt: serverTimestamp() });
        alert('Job posted!');
        loadJobs();
    };
    window.loadJobs = async function() {
        const q = query(collection(db, 'jobs'), orderBy('createdAt', 'desc'));
        const list = document.getElementById('jobsList');
        list.innerHTML = 'Loading...';
        onSnapshot(q, snap => {
            list.innerHTML = snap.docs.map(d => `<div class="post-card"><h3>${d.data().title}</h3><p>${d.data().company}</p><button onclick="deleteJob('${d.id}')">Delete</button></div>`).join('');
        });
    };
    window.deleteJob = async function(id) { await deleteDoc(doc(db, 'jobs', id)); };

    // === ARTICLES ===
    window.postArticle = async function() {
        const title = prompt('Article Title:');
        const body = prompt('Article Body:');
        if (!title || !body) return;
        await addDoc(collection(db, 'articles'), { title, body, authorUid: auth.currentUser.uid, createdAt: serverTimestamp() });
        alert('Article published!');
        loadArticles();
    };
    window.loadArticles = async function() {
        const q = query(collection(db, 'articles'), orderBy('createdAt', 'desc'));
        const list = document.getElementById('articlesList');
        list.innerHTML = 'Loading...';
        onSnapshot(q, snap => {
            list.innerHTML = snap.docs.map(d => `<div class="post-card"><h3>${d.data().title}</h3><p>${d.data().body}</p><button onclick="deleteArticle('${d.id}')">Delete</button></div>`).join('');
        });
    };
    window.deleteArticle = async function(id) { await deleteDoc(doc(db, 'articles', id)); };

    // === MARKET ===
    window.postMarket = async function() {
        const title = prompt('Listing Title:');
        if (!title) return;
        await addDoc(collection(db, 'market'), { title, postedByUid: auth.currentUser.uid, createdAt: serverTimestamp() });
        alert('Listing posted!');
        loadMarket();
    };
    window.loadMarket = async function() {
        const q = query(collection(db, 'market'), orderBy('createdAt', 'desc'));
        const list = document.getElementById('marketList');
        list.innerHTML = 'Loading...';
        onSnapshot(q, snap => {
            list.innerHTML = snap.docs.map(d => `<div class="post-card"><h3>${d.data().title}</h3><button onclick="deleteMarket('${d.id}')">Delete</button></div>`).join('');
        });
    };
    window.deleteMarket = async function(id) { await deleteDoc(doc(db, 'market', id)); };

    // === VIDEOS ===
    window.postVideo = async function() {
        const url = prompt('Video URL:');
        if (!url) return;
        await addDoc(collection(db, 'videos'), { url, postedByUid: auth.currentUser.uid, createdAt: serverTimestamp() });
        alert('Video posted!');
        loadVideos();
    };
    window.loadVideos = async function() {
        const q = query(collection(db, 'videos'), orderBy('createdAt', 'desc'));
        const list = document.getElementById('videosList');
        list.innerHTML = 'Loading...';
        onSnapshot(q, snap => {
            list.innerHTML = snap.docs.map(d => `<div class="post-card"><video src="${d.data().url}" controls width="100%"></video><button onclick="deleteVideo('${d.id}')">Delete</button></div>`).join('');
        });
    };
    window.deleteVideo = async function(id) { await deleteDoc(doc(db, 'videos', id)); };

    // === STATUS ===
    const btnStatus = document.getElementById('btnSubmitStatus');
    if (btnStatus) btnStatus.addEventListener('click', async () => {
        const text = document.getElementById('statusText').value.trim();
        if (!text) return;
        await postStatus(text);
        document.getElementById('statusText').value = '';
        alert('Status posted!');
    });

    // === LOAD ALL DATA ON LOGIN ===
    function loadAllData() {
        loadJobs();
        loadArticles();
        loadMarket();
        loadVideos();
        listenFeed(posts => console.log('Posts:', posts));
    }
});
