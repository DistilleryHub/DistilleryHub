// js/app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, query, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

// Init Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentListeners = [];

// Cleanup Listeners to save battery & money
function cleanup() {
    currentListeners.forEach(unsub => unsub());
    currentListeners = [];
}

// 1. Tab System
window.switchTab = (tab) => {
    cleanup(); 
    document.querySelectorAll('.tabpanel').forEach(p => p.classList.add('hidden'));
    const activePanel = document.getElementById('panel-' + tab);
    if(activePanel) activePanel.classList.remove('hidden');
    
    if(tab === 'feed') loadFeed();
    console.log("Switched to:", tab);
};

// 2. Feed Loader
function loadFeed() {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(20));
    const unsub = onSnapshot(q, (snap) => {
        const feedList = document.getElementById('feedList');
        if(!feedList) return;
        let html = '';
        snap.forEach(doc => {
            const post = doc.data();
            html += `
                <div class="card post" style="padding:15px; margin-bottom:15px;">
                    <div class="post-head"><strong>${post.authorName || 'Member'}</strong></div>
                    <div class="post-body" style="margin-top:10px;">${post.text || ''}</div>
                    ${post.imageURL ? `<img src="${post.imageURL}" style="width:100%; border-radius:10px; margin-top:10px;">` : ''}
                </div>
            `;
        });
        feedList.innerHTML = html || '<p>No posts yet.</p>';
    });
    currentListeners.push(unsub);
}

// 3. Auth Check
onAuthStateChanged(auth, (user) => {
    const loading = document.getElementById('authLoading');
    if (user) {
        window.currentUser = user;
        loading.classList.add('hidden');
        document.getElementById('app').classList.add('show');
        document.getElementById('authScreen').classList.add('hidden');
        switchTab('feed');
    } else {
        loading.classList.add('hidden');
        document.getElementById('authScreen').classList.remove('hidden');
        document.getElementById('app').classList.remove('show');
    }
});

// 4. Logout
document.getElementById('btnSignOut')?.addEventListener('click', () => signOut(auth));
