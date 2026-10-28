import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireView } from '@/lib/auth';
import { canEdit, canView } from '@/lib/roles';
import { todayISO, toDateOnly, fmtDate, addDays } from '@/lib/dates';
import { qty } from '@/lib/format';
import { storeItemStocks } from '@/lib/stock';
import { STORE_CATEGORIES, DEPARTMENTS, catLabel } from '@/lib/masters';
import { storeMovement } from './actions';
import { Flash, PageHeader, Field, Empty } from '@/components/ui';
import StoreMovements from '@/components/StoreMovements';

export default async function GeneralStorePage({ searchParams }) {
  const sp = await searchParams;
  const user = await requireView('generalStore');
  const today = todayISO();
  const cat = STORE_CATEGORIES.includes(sp?.cat) ? sp.cat : '';
  const [items, stocks, moves] = await Promise.all([
    prisma.packagingItem.findMany({ where: { active: true }, orderBy: [{ category: 'asc' }, { name: 'asc' }] }),
    storeItemStocks(),
    prisma.packagingLedger.findMany({ where: { date: { gte: toDateOnly(addDays(today, -6)) }, ...(cat ? { packagingItem: { category: cat } } : {}) }, include: { packagingItem: true }, orderBy: { id: 'desc' }, take: 100 }),
  ]);
  const lowOnly = sp?.low === '1';
  const isLow = (i) => (i.reorderLevel !== null && (stocks[i.id] || 0) <= i.reorderLevel) || (stocks[i.id] || 0) < 0;
  const low = items.filter(isLow);
  const shown = lowOnly ? low : cat ? items.filter((i) => i.category === cat) : items;
  const edit = canEdit(user.role, 'generalStore');
  const manager = canEdit(user.role, 'approve');
  const back = `/general-store${cat ? `?cat=${cat}` : ''}`;
  const itemSelect = (
    <Field label="Item">
      <select name="itemId" className="input" required defaultValue="">
        <option value="" disabled>Select item…</option>
        {STORE_CATEGORIES.map((c) => {
          const list = items.filter((i) => i.category === c);
          return list.length ? <optgroup key={c} label={catLabel(c)}>{list.map((i) => <option key={i.id} value={i.id}>{i.name} — {qty(stocks[i.id] || 0)} {i.unit}</option>)}</optgroup> : null;
        })}
      </select>
    </Field>
  );
  const dateField = <Field label="Date"><input type="date" name="date" defaultValue={today} max={today} className="input" /></Field>;
  const hidden = (kind) => <><input type="hidden" name="kind" value={kind} /><input type="hidden" name="back" value={back} /></>;

  return (
    <div>
      <PageHeader
        title="General Store"
        subtitle={`Packaging, cups, plastic, chemicals and other items · ${fmtDate(today)}`}
        actions={<>
          {canView(user.role, 'masters') && <Link href="/masters/packaging" className="btn-secondary">Add / edit items</Link>}
          {canView(user.role, 'reports') && <Link href="/reports/general-store" className="btn-primary">Store report</Link>}
        </>}
      />
      <Flash sp={sp} />
      {low.length > 0 && !lowOnly && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <span><b>Low stock — reorder:</b> {low.length} item{low.length > 1 ? 's' : ''} at or below the reorder level</span>
          <Link href="/general-store?low=1" className="font-medium text-amber-900 underline">Show them</Link>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link href="/general-store" className={`badge px-3 py-1 ${!cat && !lowOnly ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-300'}`}>All</Link>
        <Link href="/general-store?low=1" className={`badge px-3 py-1 ${lowOnly ? 'bg-amber-500 text-white' : 'bg-white text-amber-700 border border-amber-300'}`}>Low stock ({low.length})</Link>
        {STORE_CATEGORIES.filter((c) => items.some((i) => i.category === c)).map((c) => (
          <Link key={c} href={`/general-store?cat=${c}`} className={`badge px-3 py-1 ${cat === c && !lowOnly ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-300'}`}>{catLabel(c)}</Link>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="card overflow-x-auto xl:col-span-2">
          <table className="table">
            <thead><tr><th>Item</th><th>Category</th><th className="num">Stock</th><th className="num">Reorder at</th><th></th></tr></thead>
            <tbody>
              {shown.map((i) => {
                const s = stocks[i.id] || 0;
                return (
                  <tr key={i.id} className={s < 0 ? 'bg-red-50/60' : ''}>
                    <td><Link href={`/general-store/${i.id}`} className="font-medium text-brand-600 hover:underline">{i.name}</Link></td>
                    <td className="text-xs">{catLabel(i.category)}</td>
                    <td className={`num font-medium ${s < 0 ? 'text-red-700' : ''}`}>{qty(s)} <span className="text-xs font-normal text-slate-400">{i.unit}</span></td>
                    <td className="num text-slate-500">{i.reorderLevel === null ? '–' : qty(i.reorderLevel)}</td>
                    <td>{s < 0 ? <span className="badge bg-red-100 text-red-800">Negative</span> : isLow(i) && <span className="badge bg-amber-100 text-amber-800">Low</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {shown.length === 0 && <Empty>No items yet. Add them in Masters → General Store Items.</Empty>}
        </div>

        {edit && (
          <div className="space-y-5">
            <form action={storeMovement} className="card card-pad space-y-3">
              {hidden('RECEIPT')}
              <h2 className="h2">Receive (purchase)</h2>
              {itemSelect}
              <div className="grid grid-cols-2 gap-2"><Field label="Quantity"><input name="qty" type="number" step="any" className="input" required /></Field>{dateField}</div>
              <Field label="Supplier"><input name="party" className="input" /></Field>
              <Field label="Bill no. / note"><input name="note" className="input" /></Field>
              <button className="btn-primary w-full">Save receipt</button>
            </form>
            <form action={storeMovement} className="card card-pad space-y-3">
              {hidden('ISSUE')}
              <h2 className="h2">Issue to department</h2>
              {itemSelect}
              <div className="grid grid-cols-2 gap-2"><Field label="Quantity"><input name="qty" type="number" step="any" className="input" required /></Field>{dateField}</div>
              <Field label="Department *"><select name="party" className="input" required>{DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}</select></Field>
              <Field label="Note"><input name="note" className="input" placeholder="e.g. for CIP, issued to Ram" /></Field>
              <button className="btn-primary w-full">Save issue</button>
            </form>
            <form action={storeMovement} className="card card-pad space-y-3">
              {hidden('COUNT')}
              <h2 className="h2">Physical count</h2>
              <p className="text-xs text-slate-500">Enter what is on the shelf. The difference to the system is booked as a count adjustment.</p>
              {itemSelect}
              <div className="grid grid-cols-2 gap-2"><Field label="Counted qty"><input name="qty" type="number" step="any" min="0" className="input" required /></Field>{dateField}</div>
              <Field label="Note"><input name="note" className="input" /></Field>
              <button className="btn-secondary w-full">Save count</button>
            </form>
            {manager && (
              <form action={storeMovement} className="card card-pad space-y-3">
                {hidden('OPENING')}
                <h2 className="h2">Opening stock (Manager)</h2>
                {itemSelect}
                <div className="grid grid-cols-2 gap-2"><Field label="Quantity"><input name="qty" type="number" step="any" className="input" required /></Field>{dateField}</div>
                <button className="btn-secondary w-full">Save opening stock</button>
              </form>
            )}
          </div>
        )}
      </div>

      <div className="card mt-5 overflow-x-auto">
        <div className="border-b border-slate-100 px-4 py-3"><h2 className="h2">Last 7 days</h2></div>
        <StoreMovements moves={moves} manager={manager} back={back} showItem />
      </div>
    </div>
  );
}
