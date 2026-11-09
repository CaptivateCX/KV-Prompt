import { type NextRequest } from 'next/server';
import { get } from '@vercel/blob';
import { errorResponse, HttpError, config, SetupError } from '@/lib/config';

export const dynamic = 'force-dynamic';

// Streams a private blob (KV preview or output). Only our own folders are readable.
export async function GET(request: NextRequest) {
  try {
    if (!config.blobToken && !config.blobStoreId) throw new SetupError('Vercel Blob storage');
    const pathname = request.nextUrl.searchParams.get('pathname') ?? '';
    const download = request.nextUrl.searchParams.get('download') === '1';
    if (!/^(previews|outputs)\//.test(pathname) || pathname.includes('..')) throw new HttpError(400, 'Invalid file');

    const result = await get(pathname, {
      access: 'private',
      ifNoneMatch: request.headers.get('if-none-match') ?? undefined,
    });
    if (!result) throw new HttpError(404, 'File not found');
    if (result.statusCode === 304) {
      return new Response(null, { status: 304, headers: { ETag: result.blob.etag, 'Cache-Control': 'private, no-cache' } });
    }

    const headers: Record<string, string> = {
      'Content-Type': result.blob.contentType,
      'X-Content-Type-Options': 'nosniff',
      ETag: result.blob.etag,
      'Cache-Control': 'private, no-cache',
    };
    if (download) headers['Content-Disposition'] = `attachment; filename="${pathname.split('/').pop()}"`;
    return new Response(result.stream, { headers });
  } catch (err) {
    return errorResponse(err);
  }
}
