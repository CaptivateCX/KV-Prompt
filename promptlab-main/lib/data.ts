import { q, one } from './db';
import { HttpError } from './config';
import type { Agent, PromptVersion, Output, Kv, Run } from './types';

const AGENT_SELECT = `
  select a.*, coalesce(v.prompt_text, '') as prompt_text, v.avoid_text, coalesce(v.version_no, 0) as version_no
  from agents a left join prompt_versions v on v.id = a.current_version_id`;

export function listAgents() {
  return q<Agent>(`${AGENT_SELECT} order by a.position, a.created_at`);
}

export async function getAgent(id: string) {
  const agent = await one<Agent>(`${AGENT_SELECT} where a.id = $1`, [id]);
  if (!agent) throw new HttpError(404, 'Agent not found');
  return agent;
}

export function listVersions(agentId: string) {
  return q<PromptVersion>(
    `select v.*,
       (select count(*)::int from outputs o where o.prompt_version_id = v.id and o.status = 'done') as output_count,
       (select count(*)::int from outputs o where o.prompt_version_id = v.id and o.rating = 'up') as liked_count
     from prompt_versions v where v.agent_id = $1 order by v.version_no desc`,
    [agentId],
  );
}

/** Save a new version (or reuse an identical existing one) and optionally make it the default. */
export async function saveVersion(
  agentId: string,
  promptText: string,
  avoidText: string | null,
  note: string | null,
  makeDefault: boolean,
): Promise<PromptVersion> {
  const text = promptText.trim();
  if (!text) throw new HttpError(400, 'The prompt is empty.');
  const avoid = avoidText?.trim() || null;

  let version = await one<PromptVersion>(
    `select * from prompt_versions
     where agent_id = $1 and prompt_text = $2 and coalesce(avoid_text, '') = coalesce($3, '')
     order by version_no desc limit 1`,
    [agentId, text, avoid],
  );
  if (!version) {
    version = await one<PromptVersion>(
      `insert into prompt_versions (agent_id, version_no, prompt_text, avoid_text, note)
       values ($1, (select coalesce(max(version_no), 0) + 1 from prompt_versions where agent_id = $1), $2, $3, $4)
       returning *`,
      [agentId, text, avoid, note?.trim() || null],
    );
  }
  if (!version) throw new Error('Could not save the prompt version.');
  if (makeDefault) await q(`update agents set current_version_id = $2 where id = $1`, [agentId, version.id]);
  return version;
}

export async function getKv(id: string) {
  const kv = await one<Kv>(`select * from kvs where id = $1`, [id]);
  if (!kv) throw new HttpError(404, 'Key visual not found');
  return kv;
}

export async function getRun(id: string) {
  const run = await one<Run>(`select * from runs where id = $1`, [id]);
  if (!run) throw new HttpError(404, 'Run not found');
  return run;
}

/** Latest finished output of an agent within a run (used as input by downstream agents). */
export function latestDoneOutput(runId: string, agentId: string) {
  return one<Output>(
    `select * from outputs where run_id = $1 and agent_id = $2 and status = 'done' order by created_at desc limit 1`,
    [runId, agentId],
  );
}

/** Latest output (any status) per agent in a run. */
export function latestOutputsForRun(runId: string) {
  return q<Output>(
    `select distinct on (agent_id) * from outputs where run_id = $1 order by agent_id, created_at desc`,
    [runId],
  );
}

export function assemblePrompt(promptText: string, avoidText: string | null) {
  const avoid = avoidText?.trim();
  return avoid ? `${promptText.trim()}\n\nDo not: ${avoid}` : promptText.trim();
}
