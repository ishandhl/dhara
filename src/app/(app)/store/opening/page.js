import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireView } from '@/lib/auth';
import { todayISO, addDays, fmtDate, isoOf } from '@/lib/dates';
import { qty } from '@/lib/format';
import { saveOpeningStock } from '../actions';
import { Flash, PageHeader, Field } from '@/components/ui';
import SubmitButton from '@/components/SubmitButton';

// Day 0: every product's opening balance on one page, like the first row of the Coldroom Record sheet.
export default async function OpeningStockPage({ searchParams }) {
  const sp = await searchParams;
  await requireView('approve');
  const today = todayISO();
  const [products, openings] = await Promise.all([
    prisma.product.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.storeEntry.findMany({ where: { kind: 'OPENING', status: 'POSTED' } }),
  ]);
  const had = Object.fromEntries(openings.map((o) => [o.productId, o]));
  const todo = products.filter((p) => !had[p.id]);

  return (
    <div className="max-w-3xl">
      <PageHeader title="Opening stock" subtitle="Day 0: the cold room balance of every product, entered once." actions={<Link href="/store/entries" className="btn-secondary">Back</Link>} />
      <Flash sp={sp} />
      <p className="mb-3 text-sm text-slate-500">
        Date it the day <b>before</b> you start daily entries (usually yesterday), then do the Daily Count the same evening — it should match.
        Products that already have opening stock are locked; a manager can cancel that entry under Return / Damage / Receipt to change it.
        For the milk tank, use <Link href="/silos" className="font-medium text-blue-600 hover:underline">Milk Tank → Adjust</Link>.
      </p>
      <form action={saveOpeningStock}>
        <div className="card card-pad mb-3 grid gap-3 sm:grid-cols-2">
          <Field label="Opening date"><input type="date" name="date" defaultValue={addDays(today, -1)} max={today} className="input" /></Field>
          <Field label="Note"><input name="note" className="input" placeholder="From Coldroom Record sheet" /></Field>
        </div>
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Product</th><th className="num">Opening quantity</th></tr></thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>{p.name} <span className="text-xs text-slate-400">{p.unitName}</span></td>
                  <td className="num">
                    {had[p.id]
                      ? <span className="text-slate-500" title={`Entered for ${fmtDate(isoOf(had[p.id].date))}`}>{qty(had[p.id].qty)} ✓</span>
                      : <input name={`qty_${p.id}`} type="number" inputMode="decimal" step="any" min="0" className="input ml-auto w-32 py-1 text-right" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {todo.length > 0 && (
          <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 mt-3 flex items-center justify-end gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-b-xl lg:bottom-0">
            <span className="text-xs text-slate-500">Blank or 0 = no opening stock for that product.</span>
            <SubmitButton confirm="Save the opening stock entered on this page?">Save opening stock</SubmitButton>
          </div>
        )}
      </form>
    </div>
  );
}
