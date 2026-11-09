import { get, put } from '@vercel/blob';
import { config, SetupError } from './config';

function assertBlob() {
  if (!config.blobToken && !config.blobStoreId) throw new SetupError('Vercel Blob storage');
}

/** Read a private blob fully into memory (used for images going to Gemini). */
export async function readBlob(pathname: string): Promise<{ buffer: Buffer; contentType: string }> {
  assertBlob();
  const result = await get(pathname, { access: 'private' });
  if (!result || result.statusCode !== 200) throw new Error(`File not found in storage: ${pathname}`);
  const buffer = Buffer.from(await new Response(result.stream).arrayBuffer());
  return { buffer, contentType: result.blob.contentType };
}

/** Save bytes as a private blob and return its pathname. */
export async function saveBlob(pathname: string, body: Buffer, contentType: string): Promise<string> {
  assertBlob();
  const res = await put(pathname, body, { access: 'private', contentType, addRandomSuffix: true });
  return res.pathname;
}
