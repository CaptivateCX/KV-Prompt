import { q, one } from '@/lib/db';
import { readBlob, saveBlob } from '@/lib/blob';
import { makePreview } from '@/lib/images';
import { errorResponse, HttpError } from '@/lib/config';
import type { Kv } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Recent key visuals, newest first.
export async function GET() {
  try {
    const kvs = await q<Kv>(`select * from kvs order by uploaded_at desc limit 12`);
    return Response.json({ kvs });
  } catch (err) {
    return errorResponse(err);
  }
}

// Called by the browser once a client upload has finished.
// Makes a web-sized preview (used for display and as the model input) and records the KV.
export async function POST(request: Request) {
  try {
    const { pathname, filename, bytes } = (await request.json()) as {
      pathname?: string;
      filename?: string;
      bytes?: number;
    };
    if (!pathname || !pathname.startsWith('kvs/')) throw new HttpError(400, 'Missing or invalid upload pathname');

    const original = await readBlob(pathname);
    const preview = await makePreview(original.buffer);
    const previewPath = await saveBlob(`previews/${pathname.slice(4).replace(/\.[^.]+$/, '')}.jpg`, preview.buffer, 'image/jpeg');

    const kv = await one<Kv>(
      `insert into kvs (blob_pathname, preview_pathname, filename, content_type, bytes, width, height)
       values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [pathname, previewPath, filename || pathname.split('/').pop(), original.contentType, bytes ?? original.buffer.length, preview.width, preview.height],
    );
    return Response.json({ kv });
  } catch (err) {
    return errorResponse(err);
  }
}
