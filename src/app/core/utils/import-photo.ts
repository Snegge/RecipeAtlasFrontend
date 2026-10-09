import { preparePhoto } from './photo';

export async function prepareImportedPhoto(url: string): Promise<Blob> {
  const parsedUrl = new URL(url);

  if (
    parsedUrl.protocol !== 'https:' ||
    parsedUrl.username ||
    parsedUrl.password
  ) {
    throw new Error('The website returned an unsupported photo URL.');
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12000);
  const maxBytes = 20 * 1024 * 1024;

  try {
    // External request: do not send API headers or session credentials.
    const response = await fetch(parsedUrl.href, {
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error('The website photo could not be downloaded.');
    }

    const contentType = (
      response.headers.get('Content-Type') ?? ''
    ).split(';')[0].trim().toLowerCase();

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
      throw new Error('The website photo is not a JPEG, PNG, or WebP image.');
    }

    const reader = response.body.getReader();
    const chunks: BlobPart[] = [];
    let size = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        size += value.byteLength;

        if (size > maxBytes) {
          controller.abort();
          throw new Error('The website photo exceeds 20 MB.');
        }

        // Copy into an owned ArrayBuffer for Blob compatibility.
        const copy = new Uint8Array(value.byteLength);
        copy.set(value);
        chunks.push(copy.buffer);
      }
    } finally {
      reader.releaseLock();
    }

    const file = new File(chunks, 'website-photo', {
      type: contentType,
    });

    return await preparePhoto(file);
  } finally {
    window.clearTimeout(timeout);
  }
}