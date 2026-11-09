import { q } from '@/lib/db';
import { getAgent, listVersions, saveVersion } from '@/lib/data';
import { errorResponse } from '@/lib/config';
import type { Output } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// Versions with their most recent outputs (for side-by-side comparison in the editor).
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await getAgent(id);
    const [versions, outputs] = await Promise.all([
      listVersions(id),
      q<Output & { kv_filename: string }>(
        `select o.*, k.filename as kv_filename
         from outputs o join runs r on r.id = o.run_id join kvs k on k.id = r.kv_id
         where o.agent_id = $1 and o.status = 'done'
         order by o.created_at desc limit 120`,
        [id],
      ),
    ]);
    return Response.json({ versions, outputs });
  } catch (err) {
    return errorResponse(err);
  }
}

// Save a prompt as a version. Body: { promptText, avoidText?, note?, makeDefault? }
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { promptText: string; avoidText?: string | null; note?: string | null; makeDefault?: boolean };
    await getAgent(id);
    const version = await saveVersion(id, body.promptText ?? '', body.avoidText ?? null, body.note ?? null, !!body.makeDefault);
    return Response.json({ version, agent: await getAgent(id) });
  } catch (err) {
    return errorResponse(err);
  }
}
