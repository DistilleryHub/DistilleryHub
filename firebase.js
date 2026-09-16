import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
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
// CLOUDINARY_UPLOAD_PRESET removed — every upload now goes through the
// signed, rate-limited getCloudinarySignature Cloud Function instead (see
// uploadUtils.js). Also disable/restrict the "tdm_upload" unsigned preset
// itself on Cloudinary's dashboard — leaving it enabled there means the old
// bypass still works even though no code in this repo calls it anymore.

export const fbApp = initializeApp(firebaseConfig);
export const auth = getAuth(fbApp);
export const db = getFirestore(fbApp);
export const storage = getStorage(fbApp);
export const functions = getFunctions(fbApp);

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
