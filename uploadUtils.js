import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from './firebase';

/**
 * Uploads a file straight to Cloudinary using an UNSIGNED upload preset —
 * no backend call involved.
 *
 * Why not the signed /api/cloudinarySign flow: this app is deployed as a
 * static site on GitHub Pages (distilleryhub.github.io). GitHub Pages can
 * only serve static files — it cannot run the Cloudflare Pages Function at
 * functions/api/cloudinarySign.js, so every call to '/api/cloudinarySign'
 * 404s there, which is why photos/videos were failing everywhere ("Upload
 * failed: Could not start upload: Request failed.") while text kept working.
 * Unsigned upload is the only option that works from a static host with no
 * server component. The trade-off: no per-user rate limit at the Cloudinary
 * layer. Mitigate this from Cloudinary's dashboard (Settings → Upload →
 * your preset): cap max file size, restrict allowed formats, and turn the
 * preset off temporarily if it's ever abused.
 * If a real backend becomes available later (e.g. moving this deployment to
 * Cloudflare Pages instead of GitHub Pages), the signed flow in
 * functions/api/cloudinarySign.js is still there and can be wired back in.
 */
export async function uploadToCloudinary(file, resourceType = 'auto') {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
    { method: 'POST', body: formData }
  );
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const reason = data?.error?.message || `HTTP ${res.status}`;
    throw new Error(reason);
  }
  return data.secure_url;
}

/** Same as uploadToCloudinary but reports 0-100 progress via onProgress — used for large video files. */
export function uploadToCloudinaryWithProgress(file, resourceType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) onProgress(Math.round((ev.loaded / ev.total) * 100));
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (data.secure_url) resolve(data.secure_url);
        else reject(new Error(data?.error?.message || 'Upload failed'));
      } catch (e) { reject(e); }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(formData);
  });
}
