import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireView } from '@/lib/auth';
import { canEdit } from '@/lib/roles';
import { todayISO, toDateOnly, fmtDate, addDays, isoOf } from '@/lib/dates';
import { num, pct, qty } from '@/lib/format';
import { getDensity, getTolerances, flag } from '@/lib/tolerance';
import { batchSummary } from '@/lib/batch';
import { createBatch } from './actions';
import { Flash, PageHeader, StatusBadge, FlagBadge, Empty } from '@/components/ui';

export default async function ProductionPage({ searchParams }) {
  const sp = await searchParams;
  const user = await requireView('production');
  const to = sp?.to || todayISO();
  const from = sp?.from || addDays(to, -6);
  const [density, tols] = await Promise.all([getDensity(), getTolerances()]);
  const batches = await prisma.batch.findMany({
    where: { OR: [{ status: 'OPEN' }, { date: { gte: toDateOnly(from), lte: toDateOnly(to) } }] },
    include: { inputs: true, outputs: { include: { product: true } }, losses: true, byProducts: true, ingredients: { include: { packagingItem: true } } },
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
  });
  return (
    <div>
      <PageHeader title="Production" subtitle={`Batches ${fmtDate(from)} → ${fmtDate(to)} (open batches always shown)`} />
      <Flash sp={sp} />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <form className="flex flex-wrap items-end gap-2">
          <label><span className="label">From</span><input type="date" name="from" defaultValue={from} className="input" /></label>
          <label><span className="label">To</span><input type="date" name="to" defaultValue={to} className="input" /></label>
          <button className="btn-secondary">Show</button>
        </form>
        {canEdit(user.role, 'production') && (
          <form action={createBatch} className="flex flex-wrap items-end gap-2">
            <label><span className="label">Batch date</span><input type="date" name="date" defaultValue={todayISO()} max={todayISO()} className="input" /></label>
            <label><span className="label">Note</span><input name="note" placeholder="e.g. Toned milk run 1" className="input w-56" /></label>
            <button className="btn-primary">+ Open new batch</button>
          </form>
        )}
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Batch</th><th>Date</th><th>Products</th><th className="num">Milk allocated (L)</th><th className="num">Packed (L)</th><th className="num">Loss</th><th>Status</th></tr></thead>
          <tbody>
            {batches.map((b) => {
              const s = batchSummary(b, density);
              return (
                <tr key={b.id}>
                  <td><Link href={`/production/${b.id}`} className="font-medium text-brand-600 hover:underline">{b.batchNo}</Link>{b.note && <div className="text-xs text-slate-500">{b.note}</div>}</td>
                  <td className="whitespace-nowrap text-xs">{fmtDate(isoOf(b.date))}</td>
                  <td className="text-xs">
                    {b.outputs.map((o) => `${o.product.code} × ${qty(o.units)}`).join(', ') || '–'}
                    {b.ingredients.length > 0 && <div className="text-slate-500">+ {b.ingredients.map((g) => `${g.packagingItem.name} ${qty(g.qty)} ${g.packagingItem.unit}`).join(', ')}</div>}
                  </td>
                  <td className="num">{num(s.inputL)}</td>
                  <td className="num">{num(s.packedL)}</td>
                  <td className="num">{s.inputL ? <FlagBadge flag={b.status === 'CANCELLED' ? null : flag(s.totalLossPct, tols.PRODUCTION_LOSS)}>{`${num(s.totalLossL)} L (${pct(s.totalLossPct, 1)})`}</FlagBadge> : '–'}</td>
                  <td><StatusBadge status={b.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {batches.length === 0 && <Empty>No batches in this period.</Empty>}
      </div>
    </div>
  );
}
