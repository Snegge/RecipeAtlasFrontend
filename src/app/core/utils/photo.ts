export async function preparePhoto(file: File): Promise<Blob> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('Choose a JPEG, PNG, or WebP photo. Convert HEIC photos to JPEG first.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose a photo smaller than 20 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const ratio = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare this photo. Please choose another image.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('Could not prepare this photo.'))),
        'image/jpeg',
        0.85,
      ),
    );
    if (blob.size > 5 * 1024 * 1024)
      throw new Error('This photo is still too large. Choose a smaller image.');
    return blob;
  } catch (error) {
    throw error instanceof Error && error.name !== 'EncodingError'
      ? error
      : new Error('This photo could not be opened. Choose a different image.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
