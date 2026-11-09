import { type NextRequest } from 'next/server';
import { q } from '@/lib/db';
import { errorResponse } from '@/lib/config';
import type { HistoryItem } from '@/lib/types';

export const dynamic = 'force-dynamic';

const PAGE = 20;

// Every output with the exact prompt that made it. Filters: agentId, q (prompt text), before (cursor).
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const where: string[] = [`o.status <> 'running'`];
    const params: unknown[] = [];
    const agentId = sp.get('agentId');
    const search = sp.get('q')?.trim();
    const before = sp.get('before');
    if (agentId) { params.push(agentId); where.push(`o.agent_id = $${params.length}`); }
    if (search) { params.push(`%${search}%`); where.push(`o.final_prompt ilike $${params.length}`); }
    if (before) { params.push(before); where.push(`o.created_at < $${params.length}`); }
    params.push(PAGE + 1);

    const rows = await q<HistoryItem>(
      `select o.*, a.name as agent_name, a.position as agent_position, v.version_no, k.filename as kv_filename
       from outputs o
       join agents a on a.id = o.agent_id
       join prompt_versions v on v.id = o.prompt_version_id
       join runs r on r.id = o.run_id
       join kvs k on k.id = r.kv_id
       where ${where.join(' and ')}
       order by o.created_at desc
       limit $${params.length}`,
      params,
    );
    const items = rows.slice(0, PAGE);
    const next = rows.length > PAGE ? items[items.length - 1].created_at : null;
    return Response.json({ items, next });
  } catch (err) {
    return errorResponse(err);
  }
}
