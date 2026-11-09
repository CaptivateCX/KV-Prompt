import { one, q } from '@/lib/db';
import { getAgent, getRun, getKv, latestDoneOutput, saveVersion, assemblePrompt } from '@/lib/data';
import { readBlob, saveBlob } from '@/lib/blob';
import { generateImage } from '@/lib/gemini';
import { cropToRatio, toJpeg } from '@/lib/images';
import { config, errorResponse, HttpError } from '@/lib/config';
import type { Output } from '@/lib/types';

export const dynamic = 'force-dynamic';
// One image per request. 300s is the Hobby maximum and the Pro default.
export const maxDuration = 300;

type Ctx = { params: Promise<{ runId: string; agentId: string }> };

// Generate one output for one agent in one run.
// Body (optional): { promptText, avoidText } — if it differs from the agent's current
// prompt it is saved as a new version first and becomes the default.
export async function POST(request: Request, { params }: Ctx) {
  const { runId, agentId } = await params;
  let outputId: string | null = null;
  const started = Date.now();
  try {
    const body = (await request.json().catch(() => ({}))) as { promptText?: string; avoidText?: string | null };
    const [run, agentBefore] = await Promise.all([getRun(runId), getAgent(agentId)]);

    // 1. Make sure the prompt being used is a saved version.
    const promptText = body.promptText ?? agentBefore.prompt_text;
    const avoidText = body.avoidText === undefined ? agentBefore.avoid_text : body.avoidText;
    const version = await saveVersion(agentId, promptText, avoidText, null, true);
    const agent = { ...agentBefore, current_version_id: version.id };

    // 2. Work out the input image: the KV preview, or an upstream agent's output in this run.
    let inputPath: string;
    if (agent.input_source === 'agent' && agent.input_agent_id) {
      const upstream = await latestDoneOutput(run.id, agent.input_agent_id);
      if (!upstream?.blob_pathname) {
        const up = await getAgent(agent.input_agent_id);
        throw new HttpError(409, `This agent uses the output of "${up.name}". Run that one first.`);
      }
      inputPath = upstream.blob_pathname;
    } else {
      const kv = await getKv(run.kv_id);
      inputPath = kv.preview_pathname ?? kv.blob_pathname;
    }

    // 3. Record the attempt with the exact prompt, so History is accurate even if it fails.
    const finalPrompt = assemblePrompt(version.prompt_text, version.avoid_text);
    const created = await one<Output>(
      `insert into outputs (run_id, agent_id, prompt_version_id, final_prompt, model, aspect_ratio, image_size, input_blob_pathname, status)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'running') returning *`,
      [run.id, agent.id, version.id, finalPrompt, config.imageModel, agent.aspect_ratio, agent.image_size, inputPath],
    );
    outputId = created!.id;

    // 4. Call Gemini.
    const input = await readBlob(inputPath);
    const result = await generateImage({
      prompt: finalPrompt,
      inputImage: input.buffer,
      inputMime: input.contentType || 'image/jpeg',
      aspectRatio: agent.aspect_ratio,
      imageSize: agent.image_size,
    });

    // 5. Optional crop (e.g. the tower is generated at 9:16 and cropped to 1:3), then store.
    const jpeg = agent.crop_to ? await cropToRatio(result.buffer, agent.crop_to) : await toJpeg(result.buffer);
    const outPath = await saveBlob(`outputs/${run.id}/${agent.id}.jpg`, jpeg, 'image/jpeg');

    const output = await one<Output>(
      `update outputs set status = 'done', blob_pathname = $2, duration_ms = $3 where id = $1 returning *`,
      [outputId, outPath, Date.now() - started],
    );
    return Response.json({ output, versionNo: version.version_no });
  } catch (err) {
    if (outputId) {
      const message = err instanceof Error ? err.message : 'Generation failed';
      const failed = await q<Output>(
        `update outputs set status = 'failed', error = $2, duration_ms = $3 where id = $1 returning *`,
        [outputId, message.slice(0, 2000), Date.now() - started],
      ).catch(() => []);
      return Response.json({ error: message, output: failed[0] ?? null }, { status: 502 });
    }
    return errorResponse(err);
  }
}
