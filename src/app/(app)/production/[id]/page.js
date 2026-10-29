import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireView } from '@/lib/auth';
import { canEdit } from '@/lib/roles';
import { fmtDate, fmtDateTime, isoOf, bs } from '@/lib/dates';
import { num, pct, qty } from '@/lib/format';
import { getDensity, getTolerances, flag } from '@/lib/tolerance';
import { batchSummary, expectedPackaging } from '@/lib/batch';
import { storeItemStocks } from '@/lib/stock';
import { tankStock } from '@/lib/milkTank';
import { updateHeader, addInput, removeInput, addOutput, addByProduct, addIngredient, addPackaging, removeLine, closeBatch, cancelBatch } from '../actions';
import { Flash, PageHeader, StatusBadge, FlagBadge, Field, Empty, Stat } from '@/components/ui';

function Section({ title, hint, children, form }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-100 px-4 py-3"><h2 className="h2">{title}</h2>{hint && <p className="muted">{hint}</p>}</div>
      <div className="overflow-x-auto">{children}</div>
      {form && <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">{form}</div>}
    </div>
  );
}

function RemoveBtn({ action }) {
  return <form action={action}><button className="text-xs text-red-600 hover:underline">Remove</button></form>;
}

export default async function BatchDetail({ params, searchParams }) {
  const { id: idStr } = await params;
  const sp = await searchParams;
  const user = await requireView('production');
  const id = parseInt(idStr, 10);
  const b = await prisma.batch.findUnique({
    where: { id },
    include: { inputs: true, outputs: { include: { product: true } }, losses: { include: { reason: true } }, byProducts: true, packaging: { include: { packagingItem: true } }, ingredients: { include: { packagingItem: true }, orderBy: { id: 'asc' } } },
  });
  if (!b) notFound();
  const [density, tols, products, items, itemStocks, tankL] = await Promise.all([
    getDensity(), getTolerances(),
    prisma.product.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.packagingItem.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    storeItemStocks(),
    tankStock(),
  ]);
  const ingredientItems = items.filter((i) => i.category === 'INGREDIENT');
  const bom = await prisma.productPackaging.findMany({ where: { productId: { in: b.outputs.map((o) => o.productId) } } });
  const bomByProduct = {};
  for (const r of bom) (bomByProduct[r.productId] ||= []).push(r);
  const expected = expectedPackaging(b.outputs, bomByProduct);
  const usedByItem = {};
  for (const p of b.packaging) usedByItem[p.packagingItemId] = (usedByItem[p.packagingItemId] || 0) + p.qtyUsed;
  const pkgIds = [...new Set([...Object.keys(expected), ...Object.keys(usedByItem)].map(Number))];
  const itemById = Object.fromEntries(items.map((i) => [i.id, i]));
  const s = batchSummary(b, density);
  const lossFlag = flag(s.unexplainedPct, tols.PRODUCTION_LOSS);
  const open = b.status === 'OPEN';
  const edit = open && canEdit(user.role, 'production');
  const users = Object.fromEntries((await prisma.user.findMany({ where: { id: { in: [b.createdById, b.closedById].filter(Boolean) } } })).map((u) => [u.id, u.name]));

  return (
    <div>
      <PageHeader
        title={<span className="flex items-center gap-3">Batch {b.batchNo} <StatusBadge status={b.status} /></span>}
        subtitle={`${fmtDate(isoOf(b.date))} · opened by ${users[b.createdById]}${b.closedAt ? ` · closed by ${users[b.closedById]} ${fmtDateTime(b.closedAt)}` : ''}`}
        actions={<Link href="/production" className="btn-secondary">Back</Link>}
      />
      <Flash sp={sp} />
      {b.status === 'CANCELLED' && <div className="mb-4 rounded-lg bg-slate-200 px-4 py-2 text-sm">Cancelled: {b.cancelReason}</div>}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat icon="drop" tone="blue" label="Milk allocated" value={num(s.inputL)} unit="L" sub={b.ingredients.length ? `+ ${b.ingredients.map((g) => `${g.packagingItem.name.replace(/ \(.*\)/, '')} ${qty(g.qty)} ${g.packagingItem.unit}`).join(', ')}` : 'no ingredients added'} />
        <Stat icon="snow" tone="green" label="Packed" value={num(s.packedL)} unit="L" sub={s.yieldPct !== null ? `yield ${pct(s.yieldPct, 1)}` : 'no output yet'} />
        <Stat icon="swap" tone="violet" label="By-products" value={num(s.byL)} unit="L" sub={b.byProducts.map((x) => x.name).join(', ') || 'none'} />
        <Stat icon="alert" tone={!s.inputL ? 'slate' : { green: 'green', amber: 'amber', red: 'red' }[flag(s.totalLossPct, tols.PRODUCTION_LOSS)] || 'slate'} label="Loss" value={num(s.totalLossL)} unit="L" sub={s.inputL ? `${pct(s.totalLossPct, 1)} of milk allocated (limit ${tols.PRODUCTION_LOSS.amberPct}%)` : 'allocate milk first'} />
        {/* By-products no longer carry fat %, so a full fat balance would wrongly count cream fat as lost. Show the fat that went in. */}
        <Stat icon="flask" tone="slate" label="Fat in" value={num(s.fatIn, 1)} unit="kg" sub={b.fatPct ? `standardised to ${b.fatPct}% fat${b.snfPct ? `, ${b.snfPct}% SNF` : ''}` : 'enter fat % of the milk allocated'} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Section title="1 · Milk allocated" hint={`How much milk goes into this batch, taken from the milk tank (${num(tankL)} L in the tank now). Fat and SNF % are optional — enter them to check the fat balance.`}
          form={edit && (
            <form action={addInput.bind(null, id)} className="flex flex-wrap items-end gap-2">
              <Field label="Litres *"><input name="litres" type="number" step="0.1" min="0" className="input w-32" required /></Field>
              <Field label="Fat %"><input name="fatPct" type="number" step="0.01" className="input w-24" /></Field>
              <Field label="SNF %"><input name="snfPct" type="number" step="0.01" className="input w-24" /></Field>
              <button className="btn-primary">Add</button>
            </form>
          )}>
          <table className="table">
            <thead><tr><th className="num">Litres</th><th className="num">Fat %</th><th className="num">SNF %</th><th></th></tr></thead>
            <tbody>{b.inputs.map((i) => <tr key={i.id}><td className="num">{num(i.litres)}</td><td className="num">{i.fatPct ?? '–'}</td><td className="num">{i.snfPct ?? '–'}</td><td className="text-right">{edit && <RemoveBtn action={removeInput.bind(null, id, i.id)} />}</td></tr>)}</tbody>
            {b.inputs.length > 1 && <tfoot><tr><td className="num font-semibold">{num(s.inputL, 1)}</td><td colSpan={4} className="text-xs text-slate-500">total litres</td></tr></tfoot>}
          </table>
          {!b.inputs.length && <Empty>No milk allocated yet.</Empty>}
        </Section>

        <Section title="2 · Added ingredients" hint="SMP, sugar, stabiliser … added to the milk. Taken out of the general store when the batch is closed."
          form={edit && (
            ingredientItems.length ? (
              <form action={addIngredient.bind(null, id)} className="flex flex-wrap items-end gap-2">
                <Field label="Ingredient"><select name="packagingItemId" className="input" required defaultValue=""><option value="" disabled>Select ingredient…</option>{ingredientItems.map((i) => <option key={i.id} value={i.id}>{i.name} — {qty(itemStocks[i.id] || 0)} {i.unit} in store</option>)}</select></Field>
                <Field label="Quantity"><input name="qty" type="number" step="any" min="0" className="input w-32" required /></Field>
                <button className="btn-primary">Add</button>
              </form>
            ) : <p className="text-sm text-slate-500">No ingredients yet. Add them in Masters → General Store Items with category INGREDIENT.</p>
          )}>
          <table className="table">
            <thead><tr><th>Ingredient</th><th className="num">Quantity</th>{open && <th className="num">In store</th>}<th></th></tr></thead>
            <tbody>
              {b.ingredients.map((g) => {
                const st = itemStocks[g.packagingItemId] || 0;
                return (
                  <tr key={g.id}>
                    <td>{g.packagingItem.name}</td>
                    <td className="num font-medium">{qty(g.qty)} <span className="text-xs text-slate-400">{g.packagingItem.unit}</span></td>
                    {open && <td className={`num ${st < g.qty ? 'font-semibold text-red-600' : ''}`}>{qty(st)}</td>}
                    <td className="text-right">{edit && <RemoveBtn action={removeLine.bind(null, id, 'ingredient', g.id)} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!b.ingredients.length && <Empty>Nothing added.</Empty>}
        </Section>

        <Section title="3 · Standardised milk" hint="Fat and SNF after standardisation, used for the fat balance.">
          <form action={updateHeader.bind(null, id)} className="flex flex-wrap items-end gap-2 p-4">
            <Field label="Fat %"><input name="fatPct" type="number" step="0.01" defaultValue={b.fatPct ?? ''} className="input w-28" disabled={!edit} /></Field>
            <Field label="SNF %"><input name="snfPct" type="number" step="0.01" defaultValue={b.snfPct ?? ''} className="input w-28" disabled={!edit} /></Field>
            <Field label="Note" className="min-w-48 flex-1"><input name="note" defaultValue={b.note ?? ''} className="input" disabled={!edit} /></Field>
            {edit && <button className="btn-secondary">Save</button>}
          </form>
        </Section>

        <Section title="4 · Product output" hint="Count of packets / cups / buckets packed. Expiry is set from the product's shelf life."
          form={edit && (
            <form action={addOutput.bind(null, id)} className="flex flex-wrap items-end gap-2">
              <Field label="Product"><select name="productId" className="input" required defaultValue=""><option value="" disabled>Select product…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unitName})</option>)}</select></Field>
              <Field label="Quantity"><input name="units" type="number" step="any" className="input w-32" required /></Field>
              <button className="btn-primary">Add</button>
            </form>
          )}>
          <table className="table">
            <thead><tr><th>Product</th><th className="num">Qty</th><th className="num">Litres</th><th>Expiry (BS)</th><th></th></tr></thead>
            <tbody>{b.outputs.map((o) => <tr key={o.id}><td className="min-w-[10rem]">{o.product.name}</td><td className="num">{qty(o.units)} <span className="text-xs text-slate-400">{o.product.unitName}</span></td><td className="num">{num(o.litres)}</td><td className="whitespace-nowrap text-xs">{bs(isoOf(o.expiryDate))}</td><td className="text-right">{edit && <RemoveBtn action={removeLine.bind(null, id, 'output', o.id)} />}</td></tr>)}</tbody>
          </table>
          {!b.outputs.length && <Empty>No output yet.</Empty>}
        </Section>

        <Section title="5 · By-products" hint="Cream, skim milk or other streams taken out of this batch."
          form={edit && (
            <form action={addByProduct.bind(null, id)} className="flex flex-wrap items-end gap-2">
              <Field label="Name"><input name="name" list="byp" className="input w-36" required /><datalist id="byp"><option>Cream</option><option>Skim milk</option></datalist></Field>
              <Field label="Litres"><input name="litres" type="number" step="0.1" className="input w-28" required /></Field>
              <button className="btn-primary">Add</button>
            </form>
          )}>
          <table className="table">
            <thead><tr><th>Name</th><th className="num">Litres</th><th></th></tr></thead>
            <tbody>{b.byProducts.map((x) => <tr key={x.id}><td>{x.name}</td><td className="num">{num(x.litres, 1)}</td><td className="text-right">{edit && <RemoveBtn action={removeLine.bind(null, id, 'byproduct', x.id)} />}</td></tr>)}</tbody>
          </table>
          {!b.byProducts.length && <Empty>None.</Empty>}
        </Section>

        <Section title="6 · Packaging used" hint="Actual pouches, cups and buckets used, compared with what the output should have used."
          form={edit && (
            <form action={addPackaging.bind(null, id)} className="flex flex-wrap items-end gap-2">
              <Field label="Item"><select name="packagingItemId" className="input" required defaultValue=""><option value="" disabled>Select item…</option>{items.filter((i) => i.category !== 'INGREDIENT').map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}</select></Field>
              <Field label="Qty used"><input name="qtyUsed" type="number" step="any" className="input w-32" required /></Field>
              <button className="btn-primary">Add</button>
            </form>
          )}>
          <table className="table">
            <thead><tr><th>Item</th><th className="num">Expected</th><th className="num">Used</th><th className="num">Wastage</th></tr></thead>
            <tbody>
              {pkgIds.map((pid) => {
                const e = expected[pid] || 0;
                const u = usedByItem[pid] || 0;
                const w = u - e;
                const wp = e ? (w / e) * 100 : null;
                const it = itemById[pid];
                return <tr key={pid}><td>{it?.name}</td><td className="num">{num(e, 1)}</td><td className="num">{num(u, 1)}</td><td className="num">{u ? <FlagBadge flag={wp === null ? null : flag(wp, { greenPct: it?.allowedWastagePct ?? 1, amberPct: (it?.allowedWastagePct ?? 1) * 3 })}>{`${num(w, 1)} (${pct(wp, 1)})`}</FlagBadge> : '–'}</td></tr>;
              })}
            </tbody>
          </table>
          {b.packaging.length > 0 && (
            <details className="px-4 py-2 text-xs"><summary className="cursor-pointer text-slate-500">Entered lines</summary>
              <ul className="mt-1 space-y-1">{b.packaging.map((p) => <li key={p.id} className="flex items-center justify-between gap-2"><span>{p.packagingItem.name}: {num(p.qtyUsed, 1)} {p.packagingItem.unit}</span>{edit && <RemoveBtn action={removeLine.bind(null, id, 'packaging', p.id)} />}</li>)}</ul>
            </details>
          )}
          {!pkgIds.length && <Empty>Add product output to see expected packaging.</Empty>}
        </Section>
      </div>

      {edit && (
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <form action={closeBatch.bind(null, id)} className="card card-pad space-y-3 lg:col-span-2">
            <h2 className="h2">Close batch</h2>
            <p className="muted">Closing locks the batch, sends the packed stock to the cold room with batch {b.batchNo}, and books packaging use. {lossFlag === 'red' && <b className="text-red-700">Loss is above the limit — a closing note is required.</b>}</p>
            <Field label={`Closing note${lossFlag === 'red' ? ' *' : ''}`}><input name="closingNote" className="input" placeholder="e.g. Pouch machine jam, 40 L lost on the floor" /></Field>
            <button className="btn-success">Close batch</button>
          </form>
          {canEdit(user.role, 'approve') && (
            <form action={cancelBatch.bind(null, id)} className="card card-pad space-y-2">
              <h2 className="h2">Cancel batch (Manager)</h2>
              <p className="text-xs text-slate-500">Only for a batch opened by mistake. Milk allocated goes back into the milk tank.</p>
              <input name="reason" placeholder="Reason *" className="input" required />
              <button className="btn-danger btn-sm">Cancel batch</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
