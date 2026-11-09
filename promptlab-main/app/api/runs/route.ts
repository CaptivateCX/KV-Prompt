import { one } from '@/lib/db';
import { getKv } from '@/lib/data';
import { errorResponse, HttpError } from '@/lib/config';
import type { Run } from '@/lib/types';

export const dynamic = 'force-dynamic';

// Start a new run for a key visual.
export async function POST(request: Request) {
  try {
    const { kvId } = (await request.json()) as { kvId?: string };
    if (!kvId) throw new HttpError(400, 'Upload or pick a key visual first.');
    const kv = await getKv(kvId);
    const count = await one<{ n: number }>(`select count(*)::int as n from runs`);
    const base = kv.filename.replace(/\.[^.]+$/, '');
    const run = await one<Run>(
      `insert into runs (kv_id, label) values ($1, $2) returning *`,
      [kv.id, `${base} · Run ${(count?.n ?? 0) + 1}`],
    );
    return Response.json({ run });
  } catch (err) {
    return errorResponse(err);
  }
}
