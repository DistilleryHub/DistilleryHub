import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

/**
 * Uploads a file to Cloudinary via a server-signed, rate-limited request.
 * Replaces the old pattern (repeated across ~10 files) of posting straight
 * to Cloudinary with an unsigned upload_preset, which had no per-user
 * identity or rate limit attached at all — see functions/cloudinarySign.js
 * for why that was a real abuse/cost risk, not just a style nitpick.
 */
export async function uploadToCloudinary(file, resourceType = 'auto') {
  const getSignature = httpsCallable(functions, 'getCloudinarySignature');
  let sig;
  try {
    const res = await getSignature();
    sig = res.data;
  } catch (err) {
    if (err.code === 'functions/resource-exhausted') {
      throw new Error('Upload limit reached — try again in a few minutes.');
    }
    throw new Error('Could not start upload: ' + (err.message || err.code));
  }
  const formData = new FormData();
  formData.append('file', file);
  formData.append('api_key', sig.apiKey);
  formData.append('timestamp', sig.timestamp);
  formData.append('signature', sig.signature);
  formData.append('folder', sig.folder);
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${sig.cloudName}/${resourceType}/upload`,
    { method: 'POST', body: formData }
  );
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const reason = data?.error?.message || `HTTP ${res.status}`;
    throw new Error(reason);
  }
  return data.secure_url;
}
