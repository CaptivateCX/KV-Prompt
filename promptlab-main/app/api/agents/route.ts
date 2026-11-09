import { one } from '@/lib/db';
import { listAgents, saveVersion, getAgent } from '@/lib/data';
import { errorResponse } from '@/lib/config';
import type { Agent } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json({ agents: await listAgents() });
  } catch (err) {
    return errorResponse(err);
  }
}

// Add a new agent at the end of the pipeline.
export async function POST(request: Request) {
  try {
    const { name } = (await request.json().catch(() => ({}))) as { name?: string };
    const created = await one<Agent>(
      `insert into agents (position, name) values ((select coalesce(max(position), 0) + 1 from agents), $1) returning *`,
      [name?.trim() || 'New agent'],
    );
    await saveVersion(created!.id, 'Describe what this agent should make from the key visual.', null, 'Starting prompt', true);
    return Response.json({ agent: await getAgent(created!.id) });
  } catch (err) {
    return errorResponse(err);
  }
}
