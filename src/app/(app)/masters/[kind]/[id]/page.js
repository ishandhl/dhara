import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireView } from '@/lib/auth';
import { saveProductPackaging, removeProductPackaging, saveDipChart, testDip } from '../../actions';
import { Flash, PageHeader, Field, Empty } from '@/components/ui';
import { num } from '@/lib/format';

export default async function MasterDetail({ params, searchParams }) {
  const { kind, id: idStr } = await params;
  const sp = await searchParams;
  await requireView('masters');
  const id = parseInt(idStr, 10);
  if (kind === 'products') return <ProductDetail id={id} sp={sp} />;
  if (kind === 'silos') return <SiloDetail id={id} sp={sp} />;
  notFound();
}

async function ProductDetail({ id, sp }) {
  const product = await prisma.product.findUnique({ where: { id }, include: { packaging: { include: { packagingItem: true } } } });
  if (!product) notFound();
  const items = await prisma.packagingItem.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
  return (
    <div>
      <PageHeader title={product.name} subtitle={`${product.code} · ${product.litresPerUnit} L per ${product.unitName} · shelf life ${product.shelfLifeDays} days`} actions={<Link href="/masters/products" className="btn-secondary">Back to products</Link>} />
      <Flash sp={sp} />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card overflow-x-auto lg:col-span-2">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="h2">Packaging used per {product.unitName}</h2>
            <p className="muted">Used to work out expected packaging use from production output.</p>
          </div>
          <table className="table">
            <thead><tr><th>Packaging item</th><th className="num">Qty per {product.unitName}</th><th>Unit</th><th></th></tr></thead>
            <tbody>
              {product.packaging.map((p) => (
                <tr key={p.id}>
                  <td>{p.packagingItem.name}</td>
                  <td className="num">{p.qtyPerUnit}</td>
                  <td>{p.packagingItem.unit}</td>
                  <td className="text-right">
                    <form action={removeProductPackaging.bind(null, id, p.id)}><button className="text-xs text-red-600 hover:underline">Remove</button></form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {product.packaging.length === 0 && <Empty>No packaging set for this product.</Empty>}
        </div>
        <form action={saveProductPackaging.bind(null, id)} className="card card-pad h-fit space-y-3">
          <h2 className="h2">Add / update packaging</h2>
          <Field label="Packaging item">
            <select name="packagingItemId" className="input" required>
              {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
            </select>
          </Field>
          <Field label={`Quantity per ${product.unitName}`} hint="e.g. 1 pouch per packet, or 0.0025 kg film per packet">
            <input name="qtyPerUnit" type="number" step="any" className="input" required />
          </Field>
          <button className="btn-primary w-full">Save</button>
        </form>
      </div>
    </div>
  );
}

async function SiloDetail({ id, sp }) {
  const silo = await prisma.silo.findUnique({ where: { id }, include: { dipPoints: { orderBy: { cm: 'asc' } } } });
  if (!silo) notFound();
  const chartText = silo.dipPoints.map((p) => `${p.cm}\t${p.litres}`).join('\n');
  return (
    <div>
      <PageHeader title={`${silo.name} — dip chart`} subtitle={`Capacity ${num(silo.capacityL)} L · correction factor ${silo.correctionFactor}`} actions={<Link href="/masters/silos" className="btn-secondary">Back to silos</Link>} />
      <Flash sp={sp} />
      <div className="grid gap-5 lg:grid-cols-3">
        <form action={saveDipChart.bind(null, id)} className="card card-pad space-y-3 lg:col-span-2">
          <h2 className="h2">Dip chart</h2>
          <p className="muted">One reading per line: <b>cm</b> then <b>litres</b>, separated by a space, tab or comma. You can paste straight from Excel. Values in between are interpolated.</p>
          <textarea name="chart" rows={16} defaultValue={chartText} className="input font-mono" placeholder={'0\t0\n20\t1450\n40\t2950\n...'} />
          <button className="btn-primary">Save dip chart</button>
        </form>
        <div className="space-y-5">
          <form action={testDip.bind(null, id)} className="card card-pad space-y-3">
            <h2 className="h2">Test a reading</h2>
            <Field label="Dip (cm)"><input name="cm" type="number" step="any" className="input" defaultValue={sp?.testcm || ''} /></Field>
            <button className="btn-secondary w-full">Convert</button>
            {sp?.testcm && (
              <div className="rounded-lg bg-slate-50 p-3 text-sm">
                {sp.testl ? (<>
                  <div>Chart: <b>{num(sp.testl, 1)} L</b></div>
                  <div>× factor {silo.correctionFactor} = <b>{num(sp.testf, 1)} L</b></div>
                </>) : 'Dip chart needs at least 2 points.'}
              </div>
            )}
          </form>
          <div className="card card-pad text-sm">
            <h2 className="h2 mb-2">Points saved</h2>
            {silo.dipPoints.length === 0 ? <p className="muted">None yet. Without a chart, staff enter litres directly when unloading.</p> : (
              <p className="muted">{silo.dipPoints.length} points, from {silo.dipPoints[0].cm} cm to {silo.dipPoints.at(-1).cm} cm ({num(silo.dipPoints.at(-1).litres)} L).</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
