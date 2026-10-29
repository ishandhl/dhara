import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireView } from '@/lib/auth';
import { canEdit } from '@/lib/roles';
import { todayISO, toDateOnly, fmtDate } from '@/lib/dates';
import { qty, round } from '@/lib/format';
import { productStocks } from '@/lib/stock';
import { getTolerances, flag } from '@/lib/tolerance';
import { saveCounts, bookCountDifferences } from '../actions';
import { Flash, PageHeader, Field, FlagBadge } from '@/components/ui';

export default async function CountPage({ searchParams }) {
  const sp = await searchParams;
  const user = await requireView('store');
  const today = todayISO();
  const date = sp?.date || today;
  const [products, stocks, counts, tols] = await Promise.all([
    prisma.product.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    productStocks(date),
    prisma.stockCount.findMany({ where: { date: toDateOnly(date) } }),
    getTolerances(),
  ]);
  const byProduct = Object.fromEntries(counts.map((c) => [c.productId, c]));
  const edit = canEdit(user.role, 'store');
  const manager = canEdit(user.role, 'approve');
  const pending = counts.filter((c) => !c.adjusted && Math.abs(c.countQty - (stocks[c.productId] || 0)) > 0.0001);

  return (
    <div>
      <PageHeader title="Daily Count" subtitle={`Count record of coldroom · ${fmtDate(date)}`} actions={<Link href={`/reports/coldroom?from=${date}&to=${date}`} className="btn-secondary">See in report</Link>} />
      <Flash sp={sp} />
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <Field label="Count date"><input type="date" name="date" defaultValue={date} max={today} className="input" /></Field>
        <button className="btn-secondary">Show</button>
      </form>
      <p className="mb-3 text-sm text-slate-500">Count what is physically in the cold room at the end of the day. Leave a row blank if it was not counted. The difference is count − system stock.</p>
      <form action={saveCounts}>
        <input type="hidden" name="date" value={date} />
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Product</th><th className="num">System stock</th><th className="num">Count</th><th className="num">Difference</th><th>Remarks</th></tr></thead>
            <tbody>
              {products.map((p) => {
                const c = byProduct[p.id];
                const sys = stocks[p.id] || 0;
                const diff = c ? (c.adjusted ? c.diffQty : round(c.countQty - sys, 3)) : null;
                const base = c?.adjusted ? c.systemQty : sys;
                return (
                  <tr key={p.id}>
                    <td>{p.name} <span className="text-xs text-slate-400">{p.unitName}</span></td>
                    <td className="num">{qty(sys)}</td>
                    <td className="num">
                      {c?.adjusted
                        ? <span title="Difference already booked">{qty(c.countQty)} ✓</span>
                        : <input name={`count_${p.id}`} type="number" step="any" min="0" defaultValue={c?.countQty ?? ''} className="input ml-auto w-28 py-1 text-right" disabled={!edit} />}
                    </td>
                    <td className="num">{diff === null ? '' : <FlagBadge flag={Math.abs(diff) < 0.0001 ? 'green' : flag(base ? (diff / base) * 100 : 100, tols.FG_SHORTAGE)}>{`${diff > 0 ? '+' : ''}${qty(diff)}`}</FlagBadge>}</td>
                    <td><input name={`remark_${p.id}`} defaultValue={c?.remark ?? ''} className="input py-1 text-xs" disabled={!edit || c?.adjusted} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {edit && (
          <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 mt-3 lg:bottom-0 flex items-center justify-end gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-b-xl">
            <span className="text-xs text-slate-500">Blank rows are not saved.</span>
            <button className="btn-primary">Save count</button>
          </div>
        )}
      </form>
      {manager && pending.length > 0 && (
        <form action={bookCountDifferences} className="card card-pad mt-5 space-y-2">
          <input type="hidden" name="date" value={date} />
          <h2 className="h2">Book differences (Manager)</h2>
          <p className="text-sm text-slate-500">{pending.length} products differ from the system. Booking posts a count adjustment so system stock matches the count. This cannot be edited afterwards.</p>
          <button className="btn-danger">Book {pending.length} differences</button>
        </form>
      )}
    </div>
  );
}
