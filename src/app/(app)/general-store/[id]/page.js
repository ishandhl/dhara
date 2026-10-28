import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireView } from '@/lib/auth';
import { canEdit } from '@/lib/roles';
import { fmtDate, isoOf } from '@/lib/dates';
import { qty, round } from '@/lib/format';
import { catLabel } from '@/lib/masters';
import { Flash, PageHeader } from '@/components/ui';
import StoreMovements from '@/components/StoreMovements';

export default async function StoreItemPage({ params, searchParams }) {
  const { id: idStr } = await params;
  const sp = await searchParams;
  const user = await requireView('generalStore');
  const id = parseInt(idStr, 10);
  const item = await prisma.packagingItem.findUnique({ where: { id } });
  if (!item) notFound();
  const moves = await prisma.packagingLedger.findMany({ where: { packagingItemId: id }, include: { packagingItem: true }, orderBy: { id: 'desc' }, take: 200 });
  const byType = Object.fromEntries((await prisma.packagingLedger.groupBy({ by: ['type'], where: { packagingItemId: id }, _sum: { qty: true } })).map((r) => [r.type, r._sum.qty || 0]));
  const stock = round(Object.values(byType).reduce((a, v) => a + v, 0), 3);
  const sum = (t) => round(byType[t] || 0, 3);
  const last = moves.at(-1);

  return (
    <div>
      <PageHeader title={item.name} subtitle={`${catLabel(item.category)} · stock ${qty(stock)} ${item.unit}${item.reorderLevel !== null ? ` · reorder at ${qty(item.reorderLevel)}` : ''}`} actions={<Link href="/general-store" className="btn-secondary">Back</Link>} />
      <Flash sp={sp} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[['In stock', stock], ['Received', sum('RECEIPT')], ['Issued / used', -sum('ISSUE')], ['Count adjustments', sum('COUNT_ADJ')]].map(([k, v]) => (
          <div key={k} className="card card-pad"><div className="text-xs uppercase tracking-wide text-slate-500">{k}</div><div className="text-xl font-semibold tabular-nums">{qty(v)} <span className="text-sm font-normal text-slate-400">{item.unit}</span></div></div>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <div className="border-b border-slate-100 px-4 py-3"><h2 className="h2">Movements</h2>{last && <p className="muted">Showing the latest {moves.length}, since {fmtDate(isoOf(last.date))}</p>}</div>
        <StoreMovements moves={moves} manager={canEdit(user.role, 'approve')} back={`/general-store/${id}`} />
      </div>
    </div>
  );
}
