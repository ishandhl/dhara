import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireView } from '@/lib/auth';
import { canEdit } from '@/lib/roles';
import { fmtDate, fmtDateTime, isoOf } from '@/lib/dates';
import { qty, num } from '@/lib/format';
import { productStocks } from '@/lib/stock';
import { addChallanLine, removeChallanLine, updateChallan, dispatchChallan, cancelChallan } from '../actions';
import { Flash, PageHeader, StatusBadge, Field, Empty } from '@/components/ui';
import PrintButton from '@/components/PrintButton';
import { BRAND } from '@/lib/brand';

export default async function ChallanDetail({ params, searchParams }) {
  const { id: idStr } = await params;
  const sp = await searchParams;
  const user = await requireView('dispatch');
  const id = parseInt(idStr, 10);
  const c = await prisma.challan.findUnique({ where: { id }, include: { distributor: { include: { route: true } }, vehicle: true, lines: { include: { product: true }, orderBy: { id: 'asc' } } } });
  if (!c) notFound();
  const [products, stocks, distributors, vehicles, lots] = await Promise.all([
    prisma.product.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    productStocks(),
    prisma.distributor.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.vehicle.findMany({ where: { active: true }, orderBy: { number: 'asc' } }),
    prisma.stockLedger.findMany({ where: { refType: 'Challan', refId: id, type: 'DISPATCH_OUT', qtyUnits: { lt: 0 } }, orderBy: { id: 'asc' } }),
  ]);
  const draft = c.status === 'DRAFT';
  const edit = draft && canEdit(user.role, 'dispatch');
  const lotsByProduct = {};
  for (const l of lots) (lotsByProduct[l.productId] ||= []).push(l);
  const short = c.lines.filter((l) => (stocks[l.productId] || 0) + 0.0001 < l.qty);

  return (
    <div>
      <div className="print-only mb-4 border-b-2 border-slate-800 pb-2 text-center">
        <div className="text-xl font-bold uppercase tracking-wide">Delivery Challan</div>
        <div className="text-sm">{BRAND.name} · {c.distributor?.name || 'Distributor'}{c.vehicle ? ` · Vehicle ${c.vehicle.number}` : ''}</div>
      </div>
      <PageHeader
        title={<span className="flex items-center gap-3">Challan {c.challanNo} <StatusBadge status={c.status} /></span>}
        subtitle={`${fmtDate(isoOf(c.date))}${c.dispatchedAt ? ` · dispatched ${fmtDateTime(c.dispatchedAt)}` : ''}`}
        actions={<><PrintButton label="Print challan" /><Link href="/dispatch" className="btn-secondary no-print">Back</Link></>}
      />
      <div className="no-print"><Flash sp={sp} /></div>
      {c.status === 'CANCELLED' && <div className="mb-4 rounded-lg bg-slate-200 px-4 py-2 text-sm">Cancelled: {c.cancelReason}</div>}

      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        <form action={updateChallan.bind(null, id)} className="card card-pad space-y-3">
          <h2 className="h2">Delivery details</h2>
          <Field label="Distributor"><select name="distributorId" defaultValue={c.distributorId ?? ''} className="input" disabled={!edit}><option value="">—</option>{distributors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
          <Field label="Vehicle"><select name="vehicleId" defaultValue={c.vehicleId ?? ''} className="input" disabled={!edit}><option value="">—</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.number}{v.driver ? ` · ${v.driver}` : ''}</option>)}</select></Field>
          <Field label="Note"><input name="note" defaultValue={c.note ?? ''} className="input" disabled={!edit} /></Field>
          {edit && <button className="btn-secondary no-print">Save</button>}
          {c.distributor?.route && <p className="text-xs text-slate-500">Route: {c.distributor.route.name}</p>}
        </form>

        <div className="card overflow-hidden lg:col-span-2">
          <div className="border-b border-slate-100 px-4 py-3"><h2 className="h2">Products going out</h2></div>
          <table className="table">
            <thead><tr><th>Product</th><th className="num">Qty</th><th className="num">Crates</th>{draft ? <th className="num">In stock</th> : <th>Lots (FIFO)</th>}<th></th></tr></thead>
            <tbody>
              {c.lines.map((l) => {
                const st = stocks[l.productId] || 0;
                return (
                  <tr key={l.id}>
                    <td>{l.product.name}</td>
                    <td className="num font-medium">{qty(l.qty)} <span className="text-xs text-slate-400">{l.product.unitName}</span></td>
                    <td className="num">{l.product.crateSize ? num(l.qty / l.product.crateSize, 1) : '–'}</td>
                    {draft
                      ? <td className={`num ${st + 0.0001 < l.qty ? 'font-semibold text-red-600' : ''}`}>{qty(st)}</td>
                      : <td className="text-xs">{(lotsByProduct[l.productId] || []).map((x) => `${x.batchNo} × ${qty(-x.qtyUnits)}`).join(', ')}</td>}
                    <td className="text-right">{edit && <form action={removeChallanLine.bind(null, id, l.id)} className="no-print"><button className="text-xs text-red-600 hover:underline">Remove</button></form>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!c.lines.length && <Empty>No products yet.</Empty>}
          {edit && (
            <form action={addChallanLine.bind(null, id)} className="no-print flex flex-wrap items-end gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3">
              <Field label="Product"><select name="productId" className="input" required defaultValue=""><option value="" disabled>Select product…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name} — {qty(stocks[p.id] || 0)} {p.unitName}</option>)}</select></Field>
              <Field label="Quantity"><input name="qty" type="number" step="any" className="input w-32" required /></Field>
              <button className="btn-primary">Add</button>
            </form>
          )}
        </div>
      </div>

      <div className="print-only mt-16 grid grid-cols-3 gap-8 text-center text-sm">
        <div className="border-t border-slate-400 pt-1">Store keeper</div>
        <div className="border-t border-slate-400 pt-1">Driver</div>
        <div className="border-t border-slate-400 pt-1">Received by</div>
      </div>

      {canEdit(user.role, 'dispatch') && c.status !== 'CANCELLED' && (
        <div className="no-print grid gap-5 lg:grid-cols-3">
          {edit && (
            <form action={dispatchChallan.bind(null, id)} className="card card-pad space-y-3 lg:col-span-2">
              <h2 className="h2">Dispatch</h2>
              <p className="muted">Takes the stock out of the cold room now, oldest expiry first. It shows as “Market Going” in the cold room report.</p>
              {short.length > 0 && <p className="text-sm font-medium text-red-700">Not enough stock: {short.map((l) => l.product.name).join(', ')}</p>}
              <button className="btn-success" disabled={!c.lines.length || short.length > 0}>Dispatch challan</button>
            </form>
          )}
          {canEdit(user.role, 'approve') && (
            <form action={cancelChallan.bind(null, id)} className="card card-pad space-y-2">
              <h2 className="h2">Cancel challan (Manager)</h2>
              <p className="text-xs text-slate-500">{c.status === 'DISPATCHED' ? 'Stock goes back into the cold room.' : 'Discards this draft.'}</p>
              <input name="reason" placeholder="Reason *" className="input" required />
              <button className="btn-danger btn-sm">Cancel challan</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
