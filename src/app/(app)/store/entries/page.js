import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireView } from '@/lib/auth';
import { canEdit } from '@/lib/roles';
import { todayISO, toDateOnly, fmtDate, fmtTime } from '@/lib/dates';
import { qty } from '@/lib/format';
import { productStocks } from '@/lib/stock';
import { addStoreEntry, cancelStoreEntry } from '../actions';
import { Flash, PageHeader, Field, Empty } from '@/components/ui';

const KIND = {
  RECEIPT: ['Receipt', 'bg-emerald-100 text-emerald-800'],
  RETURN: ['Market return', 'bg-blue-100 text-blue-800'],
  DAMAGE: ['Used / damage', 'bg-amber-100 text-amber-800'],
  OPENING: ['Opening stock', 'bg-slate-200 text-slate-700'],
};

function ProductSelect({ products, stocks }) {
  return (
    <Field label="Product">
      <select name="productId" className="input" required defaultValue="">
        <option value="" disabled>Select product…</option>
        {products.map((p) => <option key={p.id} value={p.id}>{p.name} — {qty(stocks[p.id] || 0)} {p.unitName}</option>)}
      </select>
    </Field>
  );
}

export default async function StoreEntriesPage({ searchParams }) {
  const sp = await searchParams;
  const user = await requireView('store');
  const today = todayISO();
  const date = sp?.date || today;
  const [products, stocks, storeReasons, returnReasons, distributors, entries] = await Promise.all([
    prisma.product.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    productStocks(),
    prisma.lossReason.findMany({ where: { active: true, appliesTo: 'STORE' }, orderBy: { name: 'asc' } }),
    prisma.lossReason.findMany({ where: { active: true, appliesTo: 'RETURN' }, orderBy: { name: 'asc' } }),
    prisma.distributor.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.storeEntry.findMany({ where: { date: toDateOnly(date) }, include: { product: true, reason: true, distributor: true }, orderBy: { id: 'desc' } }),
  ]);
  const users = Object.fromEntries((await prisma.user.findMany({ where: { id: { in: [...new Set(entries.map((e) => e.createdById))] } } })).map((u) => [u.id, u.name]));
  const edit = canEdit(user.role, 'store');
  const manager = canEdit(user.role, 'approve');
  const dateInput = <Field label="Date"><input type="date" name="date" defaultValue={date} max={today} className="input" /></Field>;

  return (
    <div>
      <PageHeader title="Receipt / Return / Damage" subtitle={`Cold room entries · ${fmtDate(date)}`} actions={<Link href="/store" className="btn-secondary">Cold room stock</Link>} />
      <Flash sp={sp} />
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <Field label="Show entries for"><input type="date" name="date" defaultValue={date} max={today} className="input" /></Field>
        <button className="btn-secondary">Show</button>
      </form>

      {edit && (
        <div className="mb-5 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
          <form action={addStoreEntry} className="card card-pad space-y-3">
            <input type="hidden" name="kind" value="RETURN" />
            <h2 className="h2">Market return</h2>
            <p className="text-xs text-slate-500">Goods coming back from the market. Untick “sellable” for leaking or expired goods — they are booked as damage too.</p>
            <ProductSelect products={products} stocks={stocks} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Quantity"><input name="qty" type="number" step="any" className="input" required /></Field>
              {dateInput}
            </div>
            <Field label="Distributor"><select name="distributorId" className="input"><option value="">—</option>{distributors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
            <Field label="Reason"><select name="reasonId" className="input"><option value="">—</option>{returnReasons.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="sellable" defaultChecked className="h-4 w-4" /> Sellable — back into stock</label>
            <Field label="Note"><input name="note" className="input" /></Field>
            <button className="btn-primary w-full">Save return</button>
          </form>

          <form action={addStoreEntry} className="card card-pad space-y-3">
            <input type="hidden" name="kind" value="DAMAGE" />
            <h2 className="h2">Used / damage</h2>
            <p className="text-xs text-slate-500">Taken out of the cold room for internal use (e.g. cream for butter) or lost to damage. Taken from the oldest lot first.</p>
            <ProductSelect products={products} stocks={stocks} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Quantity"><input name="qty" type="number" step="any" className="input" required /></Field>
              {dateInput}
            </div>
            <Field label="Reason *"><select name="reasonId" className="input" required defaultValue=""><option value="" disabled>Select reason…</option>{storeReasons.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
            <Field label="Note"><input name="note" className="input" /></Field>
            <button className="btn-primary w-full">Save used / damage</button>
          </form>

          <form action={addStoreEntry} className="card card-pad space-y-3">
            <input type="hidden" name="kind" value="RECEIPT" />
            <h2 className="h2">Receipt into cold room</h2>
            <p className="text-xs text-slate-500">For goods not made through a production batch (e.g. khuwa, ghee, bought-in cheese). Batches add their stock automatically when closed.</p>
            <ProductSelect products={products} stocks={stocks} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Quantity"><input name="qty" type="number" step="any" className="input" required /></Field>
              {dateInput}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Batch / lot no." hint="Blank = auto"><input name="batchNo" className="input" /></Field>
              <Field label="Expiry" hint="Blank = shelf life"><input type="date" name="expiryDate" className="input" /></Field>
            </div>
            <Field label="Note"><input name="note" className="input" /></Field>
            <button className="btn-primary w-full">Save receipt</button>
          </form>

          {manager && (
            <form action={addStoreEntry} className="card card-pad space-y-3">
              <input type="hidden" name="kind" value="OPENING" />
              <h2 className="h2">Opening stock (Manager)</h2>
              <p className="text-xs text-slate-500">Use once when you start using the system: enter each product&apos;s balance from the Excel sheet, dated the day before go-live.</p>
              <ProductSelect products={products} stocks={stocks} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Quantity"><input name="qty" type="number" step="any" className="input" required /></Field>
                {dateInput}
              </div>
              <Field label="Note"><input name="note" className="input" placeholder="From Coldroom Record 2082" /></Field>
              <button className="btn-secondary w-full">Save opening stock</button>
            </form>
          )}
        </div>
      )}

      <div className="card overflow-x-auto">
        <div className="border-b border-slate-100 px-4 py-3"><h2 className="h2">Entries on {fmtDate(date)}</h2></div>
        <table className="table">
          <thead><tr><th>Time</th><th>Type</th><th>Product</th><th className="num">Qty</th><th>Reason / party</th><th>By</th><th>Status</th>{manager && <th></th>}</tr></thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className={e.status === 'CANCELLED' ? 'text-slate-400 line-through' : ''}>
                <td className="whitespace-nowrap text-xs">{fmtTime(e.createdAt)}</td>
                <td><span className={`badge ${KIND[e.kind][1]}`}>{KIND[e.kind][0]}</span>{e.kind === 'RETURN' && !e.sellable && <span className="ml-1 badge bg-red-100 text-red-800">not sellable</span>}</td>
                <td>{e.product.name}</td>
                <td className="num">{qty(e.qty)} <span className="text-xs text-slate-400">{e.product.unitName}</span></td>
                <td className="text-xs">{[e.reason?.name, e.distributor?.name, e.note].filter(Boolean).join(' · ')}</td>
                <td className="text-xs">{users[e.createdById]}</td>
                <td className="text-xs">{e.status === 'CANCELLED' ? `Cancelled: ${e.cancelReason}` : 'Posted'}</td>
                {manager && (
                  <td className="text-right">
                    {e.status === 'POSTED' && (
                      <form action={cancelStoreEntry.bind(null, e.id)} className="flex justify-end gap-1">
                        <input name="reason" placeholder="Reason" className="input w-28 py-1 text-xs" required />
                        <button className="text-xs text-red-600 hover:underline">Cancel</button>
                      </form>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {entries.length === 0 && <Empty>No entries on this date.</Empty>}
      </div>
    </div>
  );
}
