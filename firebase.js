import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getMessaging, isSupported } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: "AIzaSyB63lPTtic1RUjfq-KXWrvtisSGIetXL6k",
  authDomain: "distilleryhub-b1d2d.firebaseapp.com",
  projectId: "distilleryhub-b1d2d",
  storageBucket: "distilleryhub-b1d2d.firebasestorage.app",
  messagingSenderId: "221084904588",
  appId: "1:221084904588:web:f1c47a722b2a7c98509fa9",
  measurementId: "G-66L58LCCVY"
};

export const CLOUDINARY_CLOUD_NAME = "y8iguofl";
// Unsigned upload preset — required because this app is a static site on
// GitHub Pages with no server component to sign uploads (see uploadUtils.js
// for the full explanation). Create/re-enable a preset with this exact name
// in Cloudinary → Settings → Upload → Upload presets, set its Signing Mode
// to "Unsigned", and restrict it there (max file size, allowed formats,
// folder) since there's no server-side rate limit on this path.
export const CLOUDINARY_UPLOAD_PRESET = "tdm_upload";

export const fbApp = initializeApp(firebaseConfig);
export const auth = getAuth(fbApp);
export const db = getFirestore(fbApp);
export const storage = getStorage(fbApp);

// Replaces httpsCallable(functions, name) now that the backend lives on
// Cloudflare Pages Functions (see functions/api/*) instead of Firebase Cloud
// Functions. Same shape everywhere: signed-in call → Authorization header
// attached automatically; a non-2xx response throws with the server's
// { error: { message } } text so existing catch blocks keep working.
export async function apiFetch(path, { body, auth: needsAuth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (needsAuth) {
    if (!auth.currentUser) throw new Error('Sign in karke try karo.');
    const idToken = await auth.currentUser.getIdToken();
    headers.Authorization = `Bearer ${idToken}`;
  }
  const res = await fetch(path, {
    method: 'POST',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || 'Request failed.');
    err.status = res.status;
    throw err;
  }
  return data;
}

// Firebase Console → Project Settings → Cloud Messaging → Web Push certificates
export const VAPID_KEY = "BBceo8OB04fIWdPnTAInbfY8_zSqbuGrFVk41hpxtkfKIveY43s0Twzk62-9gSyP9YYL268IsPtsyYTkb1vOnK0";

let messagingInstance = null;
export async function getMessagingIfSupported() {
  if (messagingInstance) return messagingInstance;
  const supported = await isSupported().catch(() => false);
  if (!supported) return null;
  messagingInstance = getMessaging(fbApp);
  return messagingInstance;
}
