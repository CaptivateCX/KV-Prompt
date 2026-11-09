import { setupStatus } from '@/lib/config';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(setupStatus());
}
