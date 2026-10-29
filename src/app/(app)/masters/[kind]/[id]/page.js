import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireView } from '@/lib/auth';
import { saveProductPackaging, removeProductPackaging } from '../../actions';
import { Flash, PageHeader, Field, Empty } from '@/components/ui';

export default async function MasterDetail({ params, searchParams }) {
  const { kind, id: idStr } = await params;
  const sp = await searchParams;
  await requireView('masters');
  const id = parseInt(idStr, 10);
  if (kind === 'products') return <ProductDetail id={id} sp={sp} />;
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
