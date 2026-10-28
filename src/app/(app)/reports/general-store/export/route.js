import { currentUser } from '@/lib/auth';
import { canView } from '@/lib/roles';
import { bs } from '@/lib/dates';
import { generalStoreRegister } from '@/lib/stock';
import { generalStoreWorkbook } from '@/lib/excel';
import { readPeriod } from '@/lib/period';

export async function GET(req) {
  const user = await currentUser();
  if (!user || !canView(user.role, 'reports')) return new Response('Not allowed', { status: 403 });
  const { from, to } = readPeriod(Object.fromEntries(req.nextUrl.searchParams));
  const buf = await generalStoreWorkbook({ from, to, register: await generalStoreRegister(from, to) });
  const name = from === to ? `General Store ${bs(from)}.xlsx` : `General Store ${bs(from)} to ${bs(to)}.xlsx`;
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${name}"`,
    },
  });
}
