import { timingSafeEqual } from 'node:crypto';
import { sendStockReminder } from '@/lib/notify';

export const dynamic = 'force-dynamic';

// Called every day at 17:00 Nepal time by .github/workflows/stock-alerts.yml.
// Needs "Authorization: Bearer <CRON_SECRET>"; returns only counts, never item data.
export async function POST(req) {
  const secret = process.env.CRON_SECRET || '';
  const got = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
  const ok = secret.length >= 24 && got.length === secret.length && timingSafeEqual(Buffer.from(got), Buffer.from(secret));
  if (!ok) return Response.json({ ok: false }, { status: 401 });
  const r = await sendStockReminder();
  return Response.json({ ok: !r.errors.length, skipped: r.skipped, notSetUp: !!r.notSetUp, out: r.out, low: r.low, sent: r.sent, errors: r.errors }, { status: r.errors.length && !r.sent.length ? 502 : 200 });
}
