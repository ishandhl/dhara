import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Public check for uptime monitors. Returns no data.
//   /api/health        — is the app up? Does NOT touch the database, so a monitor checking every
//                        few minutes doesn't keep Neon awake and use up the free compute hours.
//   /api/health?db=1   — also checks the database (wakes it if asleep).
export async function GET(req) {
  if (req.nextUrl.searchParams.get('db') !== '1') return Response.json({ ok: true });
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, db: 'up', ms: Date.now() - started });
  } catch {
    return Response.json({ ok: false, db: 'down' }, { status: 503 });
  }
}
