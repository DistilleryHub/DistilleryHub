import { storage, auth } from './firebase-init.js';
import { ref as sRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

// फोटो/वीडियो अपलोड करें
export async function uploadFile(file) {
    const uid = auth.currentUser.uid;
    const path = `uploads/${uid}/${Date.now()}_${file.name}`;
    const fileRef = sRef(storage, path);
    await uploadBytes(fileRef, file);
    return await getDownloadURL(fileRef);
}
