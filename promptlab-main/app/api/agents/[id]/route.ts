import { q } from '@/lib/db';
import { getAgent, listVersions } from '@/lib/data';
import { errorResponse, HttpError } from '@/lib/config';
import { ASPECT_RATIOS, IMAGE_SIZES } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const [agent, versions] = await Promise.all([getAgent(id), listVersions(id)]);
    return Response.json({ agent, versions });
  } catch (err) {
    return errorResponse(err);
  }
}

// Update settings. Any of: name, enabled, input_source, input_agent_id,
// aspect_ratio, crop_to, image_size, position, current_version_id.
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const sets: string[] = [];
    const values: unknown[] = [id];
    const set = (col: string, val: unknown) => {
      values.push(val);
      sets.push(`${col} = $${values.length}`);
    };

    if (typeof body.name === 'string') set('name', body.name.trim() || 'Untitled agent');
    if (typeof body.enabled === 'boolean') set('enabled', body.enabled);
    if (typeof body.position === 'number') set('position', Math.round(body.position));
    if (body.input_source === 'kv') {
      set('input_source', 'kv');
      set('input_agent_id', null);
    }
    if (body.input_source === 'agent') {
      if (typeof body.input_agent_id !== 'string' || body.input_agent_id === id) throw new HttpError(400, 'Pick another agent as the input.');
      set('input_source', 'agent');
      set('input_agent_id', body.input_agent_id);
    }
    if (typeof body.aspect_ratio === 'string') {
      if (!(ASPECT_RATIOS as readonly string[]).includes(body.aspect_ratio)) throw new HttpError(400, 'Unsupported aspect ratio');
      set('aspect_ratio', body.aspect_ratio);
    }
    if ('crop_to' in body) set('crop_to', typeof body.crop_to === 'string' && /^\d+:\d+$/.test(body.crop_to) ? body.crop_to : null);
    if (typeof body.image_size === 'string') {
      if (!(IMAGE_SIZES as string[]).includes(body.image_size)) throw new HttpError(400, 'Unsupported image size');
      set('image_size', body.image_size);
    }
    if (typeof body.current_version_id === 'string') {
      const owned = await q(`select 1 from prompt_versions where id = $1 and agent_id = $2`, [body.current_version_id, id]);
      if (!owned.length) throw new HttpError(400, 'That version belongs to another agent.');
      set('current_version_id', body.current_version_id);
    }

    if (sets.length) await q(`update agents set ${sets.join(', ')} where id = $1`, values);
    return Response.json({ agent: await getAgent(id) });
  } catch (err) {
    return errorResponse(err);
  }
}
