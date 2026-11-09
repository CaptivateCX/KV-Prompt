import { one } from '@/lib/db';
import { getAgent, getKv } from '@/lib/data';
import { readBlob } from '@/lib/blob';
import { suggestPrompt } from '@/lib/gemini';
import { errorResponse, HttpError } from '@/lib/config';
import type { Output, Kv } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

// Ask Argon (text model) for a better prompt, based on the agent's latest output.
// Body: { promptText, avoidText?, goal? } — the text currently in the editor.
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { promptText?: string; avoidText?: string | null; goal?: string };
    const agent = await getAgent(id);

    const latest = await one<Output>(
      `select * from outputs where agent_id = $1 and status = 'done' order by created_at desc limit 1`,
      [id],
    );
    let inputPath = latest?.input_blob_pathname ?? null;
    if (!inputPath) {
      const kv = await one<Kv>(`select * from kvs order by uploaded_at desc limit 1`);
      if (!kv) throw new HttpError(409, 'Upload a key visual first so Argon has something to look at.');
      inputPath = (await getKv(kv.id)).preview_pathname ?? kv.blob_pathname;
    }

    const input = await readBlob(inputPath);
    const output = latest?.blob_pathname ? await readBlob(latest.blob_pathname) : null;
    const text = await suggestPrompt({
      agentName: agent.name,
      promptText: body.promptText ?? agent.prompt_text,
      avoidText: body.avoidText ?? agent.avoid_text,
      goal: body.goal,
      input: { buffer: input.buffer, mime: input.contentType },
      output: output ? { buffer: output.buffer, mime: output.contentType } : null,
    });

    const [promptPart, ...rest] = text.split(/\n\s*Why:/i);
    return Response.json({
      prompt: promptPart.replace(/^["“]|["”]$/g, '').trim(),
      why: rest.join(' ').trim(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
