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
import { updateHeader, addInput, removeInput, addOutput, addLoss, addByProduct, addIngredient, addPackaging, removeLine, closeBatch, cancelBatch, reopenBatch } from '../actions';
import SubmitButton from '@/components/SubmitButton';
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

function RemoveBtn({ action, what }) {
  return <form action={action}><SubmitButton className="px-2 py-2 text-sm text-red-600 hover:underline" pendingText="…" confirm={`Remove ${what}?`}>Remove</SubmitButton></form>;
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
  const [density, tols, products, items, itemStocks, tankL, lossReasons] = await Promise.all([
    getDensity(), getTolerances(),
    prisma.product.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.packagingItem.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    storeItemStocks(),
    tankStock(),
    prisma.lossReason.findMany({ where: { active: true, appliesTo: 'PROCESS' }, orderBy: { name: 'asc' } }),
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
  const outByProduct = {};
  for (const o of b.outputs) (outByProduct[o.productId] ||= { name: o.product.name, unit: o.product.unitName, units: 0 }).units += o.units;
  const closeSummary = `Close ${b.batchNo}? ${Object.values(outByProduct).map((x) => `${qty(x.units)} ${x.unit} ${x.name}`).join(', ') || 'No output (failed batch)'} go${Object.keys(outByProduct).length === 1 ? 'es' : ''} to the cold room.`;
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
        <Stat icon="drop" tone="blue" label="Milk taken" value={num(s.inputL)} unit="L" sub={b.ingredients.length ? `+ ${b.ingredients.map((g) => `${g.packagingItem.name.replace(/ \(.*\)/, '')} ${qty(g.qty)} ${g.packagingItem.unit}`).join(', ')}` : 'no ingredients added'} />
        <Stat icon="snow" tone="green" label="Packed" value={num(s.packedL)} unit="L" sub={s.yieldPct !== null ? `yield ${pct(s.yieldPct, 1)}` : 'no output yet'} />
        <Stat icon="swap" tone="violet" label="By-products" value={num(s.byL)} unit="L" sub={b.byProducts.map((x) => x.name).join(', ') || 'none'} />
        <Stat icon="alert" tone={!s.inputL || open ? 'slate' : { green: 'green', amber: 'amber', red: 'red' }[flag(s.totalLossPct, tols.PRODUCTION_LOSS)] || 'slate'} label={open ? 'Not yet packed' : 'Loss'} value={num(s.totalLossL)} unit="L" sub={!s.inputL ? 'enter the milk taken first' : open ? `${pct(s.totalLossPct, 1)} of the milk — becomes the loss when you close` : `${pct(s.totalLossPct, 1)} of milk taken (limit ${tols.PRODUCTION_LOSS.amberPct}%)`} />
        {/* By-products no longer carry fat %, so a full fat balance would wrongly count cream fat as lost. Show the fat that went in. */}
        <Stat icon="flask" tone="slate" label="Fat in" value={num(s.fatIn, 1)} unit="kg" sub={b.fatPct ? `standardised to ${b.fatPct}% fat${b.snfPct ? `, ${b.snfPct}% SNF` : ''}` : 'enter fat % of the milk allocated'} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Section title="1 · Milk taken from the tank" hint={`${num(tankL)} L in the tank now. Fat and SNF % are optional — enter them to check the fat balance.`}
          form={edit && (
            <form action={addInput.bind(null, id)} className="flex flex-wrap items-end gap-2">
              <Field label="Litres *"><input name="litres" type="number" inputMode="decimal" step="0.1" min="0" max={Math.max(0, Math.ceil(tankL))} className="input w-32" required /></Field>
              <Field label="Fat %"><input name="fatPct" type="number" inputMode="decimal" step="0.01" min="0" max="15" className="input w-24" /></Field>
              <Field label="SNF %"><input name="snfPct" type="number" inputMode="decimal" step="0.01" min="0" max="15" className="input w-24" /></Field>
              <SubmitButton>Add</SubmitButton>
            </form>
          )}>
          <table className="table">
            <thead><tr><th className="num">Litres</th><th className="num">Fat %</th><th className="num">SNF %</th><th></th></tr></thead>
            <tbody>{b.inputs.map((i) => <tr key={i.id}><td className="num">{num(i.litres)}</td><td className="num">{i.fatPct ?? '–'}</td><td className="num">{i.snfPct ?? '–'}</td><td className="text-right">{edit && <RemoveBtn action={removeInput.bind(null, id, i.id)} what={`${num(i.litres)} L of milk`} />}</td></tr>)}</tbody>
            {b.inputs.length > 1 && <tfoot><tr><td className="num font-semibold">{num(s.inputL, 1)}</td><td colSpan={4} className="text-xs text-slate-500">total litres</td></tr></tfoot>}
          </table>
          {!b.inputs.length && <Empty>No milk allocated yet.</Empty>}
        </Section>

        <Section title="2 · Added ingredients" hint="SMP, sugar, stabiliser … added to the milk. Taken out of the general store when the batch is closed."
          form={edit && (
            ingredientItems.length ? (
              <form action={addIngredient.bind(null, id)} className="flex flex-wrap items-end gap-2">
                <Field label="Ingredient"><select name="packagingItemId" className="input" required defaultValue=""><option value="" disabled>Select ingredient…</option>{ingredientItems.map((i) => <option key={i.id} value={i.id}>{i.name} — {qty(itemStocks[i.id] || 0)} {i.unit} in store</option>)}</select></Field>
                <Field label="Quantity"><input name="qty" type="number" inputMode="decimal" step="any" min="0" className="input w-32" required /></Field>
                <SubmitButton>Add</SubmitButton>
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
                    <td className="text-right">{edit && <RemoveBtn action={removeLine.bind(null, id, 'ingredient', g.id)} what={g.packagingItem.name} />}</td>
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
            {edit && <SubmitButton className="btn-secondary">Save</SubmitButton>}
          </form>
        </Section>

        <Section title="4 · Product output" hint="Packets / cups / buckets packed. Add counts as you fill — each entry adds to the total."
          form={edit && (
            <form action={addOutput.bind(null, id)} className="flex flex-wrap items-end gap-2">
              <Field label="Product"><select name="productId" className="input" required defaultValue=""><option value="" disabled>Select product…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unitName})</option>)}</select></Field>
              <Field label="Quantity"><input name="units" type="number" inputMode="decimal" step="any" min="0" className="input w-32" required /></Field>
              <SubmitButton>Add</SubmitButton>
            </form>
          )}>
          <table className="table">
            <thead><tr><th>Product</th><th className="num">Qty</th><th className="num">Litres</th><th></th></tr></thead>
            <tbody>{b.outputs.map((o) => <tr key={o.id}><td className="min-w-[10rem]">{o.product.name}</td><td className="num">{qty(o.units)} <span className="text-xs text-slate-400">{o.product.unitName}</span></td><td className="num">{num(o.litres)}</td><td className="text-right">{edit && <RemoveBtn action={removeLine.bind(null, id, 'output', o.id)} what={`${qty(o.units)} ${o.product.unitName} ${o.product.name}`} />}</td></tr>)}</tbody>
            {Object.keys(outByProduct).length > 0 && b.outputs.length > Object.keys(outByProduct).length && (
              <tfoot><tr className="bg-slate-50"><td colSpan={4} className="px-3 py-2 text-xs text-slate-600"><b>Total:</b> {Object.values(outByProduct).map((x) => `${x.name} ${qty(x.units)} ${x.unit}`).join(' · ')}</td></tr></tfoot>
            )}
          </table>
          {!b.outputs.length && <Empty>No output yet.</Empty>}
        </Section>

        <Section title="5 · Losses" hint="Milk lost, by reason (spillage, line flushing …). Whatever is not packed, by-product or a recorded loss shows as unexplained."
          form={edit && (
            lossReasons.length ? (
              <form action={addLoss.bind(null, id)} className="flex flex-wrap items-end gap-2">
                <Field label="Reason"><select name="reasonId" className="input" required defaultValue=""><option value="" disabled>Select reason…</option>{lossReasons.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
                <Field label="Litres"><input name="litres" type="number" inputMode="decimal" step="0.1" min="0" className="input w-28" required /></Field>
                <Field label="Note" className="min-w-40 flex-1"><input name="note" className="input" /></Field>
                <SubmitButton>Add</SubmitButton>
              </form>
            ) : <p className="text-sm text-slate-500">No loss reasons yet. Add them in Setup → Loss Reasons (Used in: PROCESS).</p>
          )}>
          <table className="table">
            <thead><tr><th>Reason</th><th className="num">Litres</th><th>Note</th><th></th></tr></thead>
            <tbody>{b.losses.map((l) => <tr key={l.id}><td>{l.reason.name}</td><td className="num">{num(l.litres, 1)}</td><td className="text-xs text-slate-500">{l.note || ''}</td><td className="text-right">{edit && <RemoveBtn action={removeLine.bind(null, id, 'loss', l.id)} what={`${num(l.litres, 1)} L ${l.reason.name}`} />}</td></tr>)}</tbody>
          </table>
          {b.inputs.length > 0 && b.outputs.length > 0 && <p className="px-4 py-2 text-xs text-slate-500">Unexplained: <b className={lossFlag === 'red' ? 'text-red-700' : ''}>{num(s.unexplainedL, 1)} L ({pct(s.unexplainedPct, 1)})</b></p>}
        </Section>

        <Section title="6 · By-products" hint="Cream, skim milk or other streams taken out of this batch."
          form={edit && (
            <form action={addByProduct.bind(null, id)} className="flex flex-wrap items-end gap-2">
              <Field label="Name"><input name="name" list="byp" className="input w-36" required /><datalist id="byp"><option>Cream</option><option>Skim milk</option></datalist></Field>
              <Field label="Litres"><input name="litres" type="number" inputMode="decimal" step="0.1" min="0" className="input w-28" required /></Field>
              <SubmitButton>Add</SubmitButton>
            </form>
          )}>
          <table className="table">
            <thead><tr><th>Name</th><th className="num">Litres</th><th></th></tr></thead>
            <tbody>{b.byProducts.map((x) => <tr key={x.id}><td>{x.name}</td><td className="num">{num(x.litres, 1)}</td><td className="text-right">{edit && <RemoveBtn action={removeLine.bind(null, id, 'byproduct', x.id)} what={`${num(x.litres, 1)} L ${x.name}`} />}</td></tr>)}</tbody>
          </table>
          {!b.byProducts.length && <Empty>None.</Empty>}
        </Section>

        <Section title="7 · Packaging used" hint="Actual pouches, cups and buckets used. Items left blank are booked as expected when the batch closes."
          form={edit && (
            <form action={addPackaging.bind(null, id)} className="flex flex-wrap items-end gap-2">
              <Field label="Item"><select name="packagingItemId" className="input" required defaultValue=""><option value="" disabled>Select item…</option>{items.filter((i) => i.category !== 'INGREDIENT').map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}</select></Field>
              <Field label="Qty used"><input name="qtyUsed" type="number" inputMode="decimal" step="any" min="0" className="input w-32" required /></Field>
              <SubmitButton>Add</SubmitButton>
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
                return <tr key={pid}><td>{it?.name}{open && (itemStocks[pid] || 0) < (u || e) && <span className="ml-1 text-xs font-semibold text-red-600">only {qty(itemStocks[pid] || 0)} in store</span>}</td><td className="num">{num(e, 1)}</td><td className="num">{u ? num(u, 1) : open ? <span className="text-xs text-slate-400">= expected</span> : '–'}</td><td className="num">{u ? <FlagBadge flag={wp === null ? null : flag(wp, { greenPct: it?.allowedWastagePct ?? 1, amberPct: (it?.allowedWastagePct ?? 1) * 3 })}>{`${num(w, 1)} (${pct(wp, 1)})`}</FlagBadge> : '–'}</td></tr>;
              })}
            </tbody>
          </table>
          {b.packaging.length > 0 && (
            <details className="px-4 py-2 text-xs"><summary className="cursor-pointer text-slate-500">Entered lines</summary>
              <ul className="mt-1 space-y-1">{b.packaging.map((p) => <li key={p.id} className="flex items-center justify-between gap-2"><span>{p.packagingItem.name}: {num(p.qtyUsed, 1)} {p.packagingItem.unit}</span>{edit && <RemoveBtn action={removeLine.bind(null, id, 'packaging', p.id)} what={p.packagingItem.name} />}</li>)}</ul>
            </details>
          )}
          {!pkgIds.length && <Empty>Add product output to see expected packaging.</Empty>}
        </Section>
      </div>

      {edit && (
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <form action={closeBatch.bind(null, id)} className="card card-pad space-y-3 lg:col-span-2">
            <h2 className="h2">Close batch</h2>
            <p className="muted">Closing sends the packed stock to the cold room as batch {b.batchNo} and takes packaging and ingredients out of the general store. A manager can reopen it if a count was wrong. {lossFlag === 'red' && b.outputs.length > 0 && <b className="text-red-700">Unexplained loss is above the limit — a closing note is required.</b>} {!b.outputs.length && <b className="text-red-700">No output: if the batch failed, write a closing note saying so.</b>}</p>
            <Field label={`Closing note${lossFlag === 'red' || !b.outputs.length ? ' *' : ''}`}><input name="closingNote" className="input" placeholder="e.g. Pouch machine jam, 40 L lost on the floor" /></Field>
            <SubmitButton className="btn-success" pendingText="Closing…" confirm={closeSummary}>Close batch</SubmitButton>
          </form>
          {canEdit(user.role, 'approve') && (
            <form action={cancelBatch.bind(null, id)} className="card card-pad space-y-2">
              <h2 className="h2">Cancel batch (Manager)</h2>
              <p className="text-xs text-slate-500">Only for a batch opened by mistake — its milk goes back into the milk tank. If the milk was used but the batch failed, close it with a note instead.</p>
              <input name="reason" placeholder="Reason *" className="input" required />
              <SubmitButton className="btn-danger btn-sm" confirm={`Cancel ${b.batchNo}? ${num(s.inputL)} L goes back into the milk tank.`}>Cancel batch</SubmitButton>
            </form>
          )}
        </div>
      )}

      {b.status === 'CLOSED' && canEdit(user.role, 'approve') && (
        <form action={reopenBatch.bind(null, id)} className="card card-pad mt-5 max-w-xl space-y-2">
          <h2 className="h2">Reopen to correct (Manager)</h2>
          <p className="text-xs text-slate-500">For a wrong count found after closing. Its products come back out of the cold room and its packaging goes back to the store until you close it again. Not possible once any of its products have been dispatched.</p>
          <input name="reason" placeholder="Reason * (e.g. 2 buckets missed in the count)" className="input" required />
          <SubmitButton className="btn-secondary btn-sm" confirm={`Reopen ${b.batchNo}? Its products leave cold room stock until it is closed again.`}>Reopen batch</SubmitButton>
        </form>
      )}
    </div>
  );
}
