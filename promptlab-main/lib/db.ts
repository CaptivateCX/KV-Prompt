import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { config, SetupError } from './config';

// Tables are created automatically on first use (idempotent), and the four
// default agents are added if the agents table is empty. No migration step
// is needed in the Vercel build.

const SCHEMA: string[] = [
  `create table if not exists agents (
    id uuid primary key default gen_random_uuid(),
    position int not null,
    name text not null,
    enabled boolean not null default true,
    input_source text not null default 'kv',
    input_agent_id uuid references agents(id),
    aspect_ratio text not null default '16:9',
    crop_to text,
    image_size text not null default '2K',
    current_version_id uuid,
    created_at timestamptz not null default now()
  )`,
  `create table if not exists prompt_versions (
    id uuid primary key default gen_random_uuid(),
    agent_id uuid not null references agents(id) on delete cascade,
    version_no int not null,
    prompt_text text not null,
    avoid_text text,
    note text,
    created_at timestamptz not null default now(),
    unique (agent_id, version_no)
  )`,
  `create table if not exists kvs (
    id uuid primary key default gen_random_uuid(),
    blob_pathname text not null,
    preview_pathname text,
    filename text not null,
    content_type text not null,
    bytes int,
    width int,
    height int,
    uploaded_at timestamptz not null default now()
  )`,
  `create table if not exists runs (
    id uuid primary key default gen_random_uuid(),
    kv_id uuid not null references kvs(id),
    label text,
    created_at timestamptz not null default now()
  )`,
  `create table if not exists outputs (
    id uuid primary key default gen_random_uuid(),
    run_id uuid not null references runs(id) on delete cascade,
    agent_id uuid not null references agents(id),
    prompt_version_id uuid not null references prompt_versions(id),
    final_prompt text not null,
    model text not null,
    aspect_ratio text not null,
    image_size text not null,
    input_blob_pathname text not null,
    blob_pathname text,
    status text not null default 'running',
    error text,
    duration_ms int,
    rating text,
    created_at timestamptz not null default now()
  )`,
  `create index if not exists outputs_agent_created_idx on outputs (agent_id, created_at desc)`,
  `create index if not exists outputs_run_idx on outputs (run_id)`,
];

// Fixed ids for the default agents so the seed is a single idempotent statement.
const A1 = '00000000-0000-4000-8000-000000000001';
const A2 = '00000000-0000-4000-8000-000000000002';
const A3 = '00000000-0000-4000-8000-000000000003';
const A4 = '00000000-0000-4000-8000-000000000004';
const V1 = '00000000-0000-4000-8000-000000000101';
const V2 = '00000000-0000-4000-8000-000000000102';
const V3 = '00000000-0000-4000-8000-000000000103';
const V4 = '00000000-0000-4000-8000-000000000104';

const SEED_AGENTS = `
insert into agents (id, position, name, input_source, input_agent_id, aspect_ratio, crop_to, image_size, current_version_id)
select * from (values
  ('${A1}'::uuid, 1, 'Simplify · Landscape',     'kv',    null::uuid,     '16:9', null::text, '2K', '${V1}'::uuid),
  ('${A2}'::uuid, 2, 'Contextual elements',      'kv',    null::uuid,     '16:9', null::text, '2K', '${V2}'::uuid),
  ('${A3}'::uuid, 3, 'Portrait tower',           'agent', '${A1}'::uuid,  '9:16', '1:3',      '2K', '${V3}'::uuid),
  ('${A4}'::uuid, 4, 'Presentation background',  'kv',    null::uuid,     '16:9', null::text, '2K', '${V4}'::uuid)
) as v
where not exists (select 1 from agents)`;

const SEED_VERSIONS = `
insert into prompt_versions (id, agent_id, version_no, prompt_text, note)
select v.* from (values
  ('${V1}'::uuid, '${A1}'::uuid, 1, 'Can you simplify this Key Visual poster down to 4 visual elements maximum? Keep only the brand logo, main focal image and primary message.', 'Starting prompt'),
  ('${V2}'::uuid, '${A2}'::uuid, 1, 'Can you help me show the elements on this design that are surplus to requirement, by removing only the brand logo, main focal image and primary message?', 'Starting prompt'),
  ('${V3}'::uuid, '${A3}'::uuid, 1, 'Now can you make me a portrait version of this design that is quite narrow in format?', 'Starting prompt'),
  ('${V4}'::uuid, '${A4}'::uuid, 1, 'Can you create a PowerPoint template page for this campaign? Very simply, only use and feature the logo, background and brand colours, plus one single main focal image. NO TEXT.', 'Starting prompt')
) as v(id, agent_id, version_no, prompt_text, note)
where exists (select 1 from agents a where a.id = v.agent_id)
  and not exists (select 1 from prompt_versions p where p.id = v.id)`;

let client: NeonQueryFunction<false, false> | null = null;
let ready: Promise<void> | null = null;

function getClient() {
  if (!config.databaseUrl) throw new SetupError('the database (DATABASE_URL)');
  if (!client) client = neon(config.databaseUrl);
  return client;
}

async function ensureSchema() {
  const sql = getClient();
  // The advisory lock stops two cold-starting functions racing to create tables.
  await sql.transaction([
    sql.query('select pg_advisory_xact_lock(4242001)'),
    ...SCHEMA.map((s) => sql.query(s)),
    sql.query(SEED_AGENTS),
    sql.query(SEED_VERSIONS),
  ]);
}

/** Run a parameterised query ($1, $2…) and return the rows. */
export async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const sql = getClient();
  if (!ready) ready = ensureSchema().catch((e) => { ready = null; throw e; });
  await ready;
  return (await sql.query(text, params)) as T[];
}

export async function one<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}
