import { currentUser } from '@/lib/auth';
import { canView } from '@/lib/roles';
import { addDays, bs } from '@/lib/dates';
import { coldroomRegister } from '@/lib/stock';
import { coldroomWorkbook } from '@/lib/excel';
import { readPeriod } from '@/lib/period';

const MAX_DAY_SHEETS = 62;

export async function GET(req) {
  const user = await currentUser();
  if (!user || !canView(user.role, 'reports')) return new Response('Not allowed', { status: 403 });
  const { from, to } = readPeriod(Object.fromEntries(req.nextUrl.searchParams));
  const summary = await coldroomRegister(from, to);
  const days = [];
  for (let d = from; d <= to && days.length < MAX_DAY_SHEETS; d = addDays(d, 1)) days.push({ date: d, register: await coldroomRegister(d, d) });
  const buf = await coldroomWorkbook({ from, to, summary, days });
  const name = from === to ? `Coldroom Record ${bs(from)}.xlsx` : `Coldroom Record ${bs(from)} to ${bs(to)}.xlsx`;
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${name}"`,
    },
  });
}
