import { one } from '@/lib/db';
import { latestOutputsForRun, getKv } from '@/lib/data';
import { errorResponse } from '@/lib/config';
import type { Run } from '@/lib/types';

export const dynamic = 'force-dynamic';

// The most recent run, its KV and the latest output per agent, so a page refresh keeps state.
export async function GET() {
  try {
    const run = await one<Run>(`select * from runs order by created_at desc limit 1`);
    if (!run) return Response.json({ run: null, kv: null, outputs: [] });
    const [kv, outputs] = await Promise.all([getKv(run.kv_id), latestOutputsForRun(run.id)]);
    return Response.json({ run, kv, outputs });
  } catch (err) {
    return errorResponse(err);
  }
}
