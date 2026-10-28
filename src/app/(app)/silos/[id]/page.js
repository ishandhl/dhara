import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireView } from '@/lib/auth';
import { todayISO, toDateOnly, fmtDate, fmtDateTime, addDays, isoOf } from '@/lib/dates';
import { num } from '@/lib/format';
import { PageHeader, Empty } from '@/components/ui';

export default async function SiloLedger({ params, searchParams }) {
  const { id: idStr } = await params;
  const sp = await searchParams;
  await requireView('silos');
  const id = parseInt(idStr, 10);
  const silo = await prisma.silo.findUnique({ where: { id } });
  if (!silo) notFound();
  const to = sp?.to || todayISO();
  const from = sp?.from || addDays(to, -6);
  const opening = await prisma.siloMovement.aggregate({ where: { siloId: id, date: { lt: toDateOnly(from) } }, _sum: { litres: true } });
  const moves = await prisma.siloMovement.findMany({ where: { siloId: id, date: { gte: toDateOnly(from), lte: toDateOnly(to) } }, orderBy: [{ date: 'asc' }, { id: 'asc' }] });
  const dips = await prisma.siloDip.findMany({ where: { siloId: id, date: { gte: toDateOnly(from), lte: toDateOnly(to) } }, orderBy: { id: 'desc' } });
  let bal = opening._sum.litres || 0;
  const rows = moves.map((m) => ({ ...m, bal: (bal += m.litres) }));
  return (
    <div>
      <PageHeader title={`${silo.name} ledger`} subtitle={`${fmtDate(from)} → ${fmtDate(to)}`} actions={<Link href="/silos" className="btn-secondary">Back</Link>} />
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <label><span className="label">From</span><input type="date" name="from" defaultValue={from} className="input" /></label>
        <label><span className="label">To</span><input type="date" name="to" defaultValue={to} className="input" /></label>
        <button className="btn-secondary">Show</button>
      </form>
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="card overflow-x-auto xl:col-span-2">
          <table className="table">
            <thead><tr><th>Date</th><th>Type</th><th>Note</th><th className="num">In / out (L)</th><th className="num">Balance (L)</th></tr></thead>
            <tbody>
              <tr><td colSpan={4} className="font-medium">Opening balance</td><td className="num font-medium">{num(opening._sum.litres || 0, 1)}</td></tr>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap text-xs">{fmtDate(isoOf(m.date))}</td>
                  <td>{m.type.replace('_', ' ')}</td>
                  <td className="text-xs text-slate-500">{m.note}</td>
                  <td className={`num ${m.litres < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{m.litres > 0 ? '+' : ''}{num(m.litres, 1)}</td>
                  <td className="num">{num(m.bal, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <Empty>No movements in this period.</Empty>}
        </div>
        <div className="card overflow-x-auto">
          <div className="border-b border-slate-100 px-4 py-3"><h2 className="h2">Dip readings</h2></div>
          <table className="table">
            <thead><tr><th>When</th><th className="num">Dip L</th><th className="num">System L</th><th className="num">Var.</th></tr></thead>
            <tbody>
              {dips.map((d) => (
                <tr key={d.id}><td className="text-xs">{fmtDateTime(d.createdAt)}<div className="text-slate-400">{d.kind}</div></td><td className="num">{num(d.litres)}</td><td className="num">{num(d.systemLitres)}</td><td className={`num ${d.varianceL < 0 ? 'text-red-600' : ''}`}>{num(d.varianceL)}</td></tr>
              ))}
            </tbody>
          </table>
          {dips.length === 0 && <Empty>No readings.</Empty>}
        </div>
      </div>
    </div>
  );
}
