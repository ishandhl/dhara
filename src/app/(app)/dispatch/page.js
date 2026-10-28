import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireView } from '@/lib/auth';
import { canEdit } from '@/lib/roles';
import { todayISO, toDateOnly, fmtDate, addDays, isoOf } from '@/lib/dates';
import { qty } from '@/lib/format';
import { createChallan } from './actions';
import { Flash, PageHeader, StatusBadge, Empty } from '@/components/ui';

export default async function DispatchPage({ searchParams }) {
  const sp = await searchParams;
  const user = await requireView('dispatch');
  const today = todayISO();
  const to = sp?.to || today;
  const from = sp?.from || addDays(to, -6);
  const [challans, distributors, vehicles] = await Promise.all([
    prisma.challan.findMany({
      where: { OR: [{ status: 'DRAFT' }, { date: { gte: toDateOnly(from), lte: toDateOnly(to) } }] },
      include: { distributor: true, vehicle: true, lines: { include: { product: true } } },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    }),
    prisma.distributor.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.vehicle.findMany({ where: { active: true }, orderBy: { number: 'asc' } }),
  ]);
  return (
    <div>
      <PageHeader title="Dispatch (Market Going)" subtitle={`Challans ${fmtDate(from)} → ${fmtDate(to)} (drafts always shown)`} />
      <Flash sp={sp} />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <form className="flex flex-wrap items-end gap-2">
          <label><span className="label">From</span><input type="date" name="from" defaultValue={from} className="input" /></label>
          <label><span className="label">To</span><input type="date" name="to" defaultValue={to} className="input" /></label>
          <button className="btn-secondary">Show</button>
        </form>
        {canEdit(user.role, 'dispatch') && (
          <form action={createChallan} className="flex flex-wrap items-end gap-2">
            <label><span className="label">Date</span><input type="date" name="date" defaultValue={today} max={today} className="input" /></label>
            <label><span className="label">Distributor</span><select name="distributorId" className="input"><option value="">—</option>{distributors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
            <label><span className="label">Vehicle</span><select name="vehicleId" className="input"><option value="">—</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.number}</option>)}</select></label>
            <button className="btn-primary">+ New challan</button>
          </form>
        )}
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Challan</th><th>Date</th><th>Distributor</th><th>Vehicle</th><th>Products</th><th>Status</th></tr></thead>
          <tbody>
            {challans.map((c) => (
              <tr key={c.id}>
                <td><Link href={`/dispatch/${c.id}`} className="font-medium text-brand-600 hover:underline">{c.challanNo}</Link></td>
                <td className="whitespace-nowrap text-xs">{fmtDate(isoOf(c.date))}</td>
                <td>{c.distributor?.name || '–'}</td>
                <td>{c.vehicle?.number || '–'}</td>
                <td className="text-xs">{c.lines.map((l) => `${l.product.code} × ${qty(l.qty)}`).join(', ') || '–'}</td>
                <td><StatusBadge status={c.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {challans.length === 0 && <Empty>No challans in this period.</Empty>}
      </div>
    </div>
  );
}
