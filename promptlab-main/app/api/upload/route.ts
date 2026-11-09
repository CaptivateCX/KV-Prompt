import { issueSignedToken } from '@vercel/blob';
import { handleUploadPresigned, type HandleUploadPresignedBody } from '@vercel/blob/client';
import { config, SetupError, errorResponse } from '@/lib/config';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff'];
const MAX_BYTES = 50 * 1024 * 1024;

// Gives the browser a short-lived presigned URL so it can upload a KV straight to
// Vercel Blob (the file never passes through this function, so the 4.5 MB limit
// doesn't apply). Works with the store's OIDC connection (BLOB_STORE_ID) or a
// static BLOB_READ_WRITE_TOKEN, whichever the project has.
export async function POST(request: Request) {
  try {
    if (!config.blobStoreId && !config.blobToken) throw new SetupError('Vercel Blob storage (BLOB_STORE_ID)');
    const body = (await request.json()) as HandleUploadPresignedBody;
    const json = await handleUploadPresigned({
      body,
      request,
      getSignedToken: async (pathname) => {
        if (!pathname.startsWith('kvs/') || pathname.includes('..')) throw new Error('Uploads must go to the kvs/ folder');
        const token = await issueSignedToken({
          pathname,
          operations: ['put'],
          allowedContentTypes: ALLOWED_TYPES,
          maximumSizeInBytes: MAX_BYTES,
          validUntil: Date.now() + 15 * 60 * 1000,
        });
        return {
          token,
          urlOptions: {
            allowedContentTypes: ALLOWED_TYPES,
            maximumSizeInBytes: MAX_BYTES,
            addRandomSuffix: true,
            allowOverwrite: false,
          },
        };
      },
    });
    return Response.json(json);
  } catch (err) {
    if (err instanceof SetupError) return errorResponse(err);
    console.error('Upload token error', err);
    return Response.json({ error: err instanceof Error ? err.message : 'Upload failed' }, { status: 400 });
  }
}
