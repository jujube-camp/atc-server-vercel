import { put } from '@vercel/blob';

export class BlobService {
  /**
   * Upload an audio buffer to Vercel Blob and return the public URL.
   * Requires BLOB_READ_WRITE_TOKEN env var.
   */
  static async uploadAudio(
    pathname: string,
    buffer: Buffer,
    contentType = 'audio/mpeg',
  ): Promise<string> {
    const blob = await put(pathname, buffer, {
      access: 'public',
      contentType,
    });
    return blob.url;
  }
}
