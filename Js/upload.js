export async function uploadFile(file) {
    const cloudName = "y8iguofl";
    const uploadPreset = "tdm_upload";

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', uploadPreset);

    try {
        const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
            method: 'POST',
            body: formData
        });

        if (!res.ok) {
            throw new Error('Server returned ' + res.status);
        }

        const data = await res.json();
        return data.secure_url;
    } catch (error) {
        throw new Error('Upload Failed: ' + error.message);
    }
}
