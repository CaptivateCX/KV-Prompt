import { one } from '@/lib/db';
import { errorResponse, HttpError } from '@/lib/config';
import type { Output } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// Rate an output. Body: { rating: 'up' | 'down' | null }
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { rating } = (await request.json()) as { rating?: string | null };
    if (rating !== 'up' && rating !== 'down' && rating !== null) throw new HttpError(400, 'Rating must be up, down or null');
    const output = await one<Output>(`update outputs set rating = $2 where id = $1 returning *`, [id, rating]);
    if (!output) throw new HttpError(404, 'Output not found');
    return Response.json({ output });
  } catch (err) {
    return errorResponse(err);
  }
}
