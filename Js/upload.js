export async function uploadFile(file) {
    const cloudName = "y8iguofl"; // आपका सही Cloudinary नाम
    const uploadPreset = "tdm_upload"; // आपका Unsigned Preset

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', uploadPreset);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
        method: 'POST',
        body: formData
    });

    if (!res.ok) {
        // अगर upload fail हो, तो error दिखाएं
        throw new Error('Cloudinary Upload Failed');
    }

    const data = await res.json();
    return data.secure_url; // सफल होने पर URL लौटाएगा
}
