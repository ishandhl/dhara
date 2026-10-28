import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireView } from '@/lib/auth';
import { canView } from '@/lib/roles';
import { fmtDate, isoOf, todayISO, bs } from '@/lib/dates';
import { num, qty } from '@/lib/format';
import { productBatchStock, daysLeft } from '@/lib/stock';
import { PRODUCT_CATEGORIES } from '@/lib/masters';
import { Flash, PageHeader, Empty, Stat } from '@/components/ui';

const LOT_LABEL = { OPENING: 'Opening stock', RETURN: 'Market return', COUNT: 'Count adjustment' };
const CAT_LABEL = { MILK: 'Milk', CURD: 'Curd & dhau', CHEESE: 'Cheese', BUTTER: 'Butter', GHEE: 'Ghee', CREAM: 'Cream', OTHER: 'Other' };

function ExpiryBadge({ d }) {
  if (d === null) return <span className="text-xs text-slate-400">no expiry</span>;
  const cls = d < 0 ? 'bg-red-100 text-red-800' : d <= 1 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700';
  return <span className={`badge ${cls}`}>{d < 0 ? 'Expired' : d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `${d} days`}</span>;
}

export default async function StorePage({ searchParams }) {
  const sp = await searchParams;
  const user = await requireView('store');
  const cat = PRODUCT_CATEGORIES.includes(sp?.cat) ? sp.cat : '';
  const q = (sp?.q || '').trim().toLowerCase();
  const showAll = sp?.all === '1';
  const [products, rows] = await Promise.all([
    prisma.product.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    productBatchStock(),
  ]);
  const byProduct = {};
  for (const r of rows) (byProduct[r.productId] ||= []).push(r);
  for (const k in byProduct) byProduct[k].sort((a, b) => isoOf(a.expiryDate).localeCompare(isoOf(b.expiryDate)));

  const all = products.filter((p) => p.active || byProduct[p.id]).map((p) => {
    const lots = byProduct[p.id] || [];
    const total = lots.reduce((a, r) => a + r.qty, 0);
    const dated = lots.filter((l) => l.expiryDate && l.qty > 0);
    const nearest = dated.length ? Math.min(...dated.map((l) => daysLeft(l.expiryDate))) : null;
    return { p, lots, total, nearest };
  });
  const list = all.filter((r) => (showAll || Math.abs(r.total) > 0.0001) && (!cat || r.p.category === cat) && (!q || r.p.name.toLowerCase().includes(q) || r.p.code.toLowerCase().includes(q)));
  const inStock = all.filter((r) => r.total > 0.0001);
  const litres = inStock.reduce((a, r) => a + r.total * r.p.litresPerUnit, 0);
  const expiring = all.filter((r) => r.nearest !== null && r.nearest <= 1 && r.total > 0);
  const negative = all.filter((r) => r.total < -0.0001);
  const link = (o) => {
    const s = new URLSearchParams({ ...(cat ? { cat } : {}), ...(q ? { q } : {}), ...(showAll ? { all: '1' } : {}), ...o });
    for (const [k, v] of [...s]) if (!v) s.delete(k);
    return `/store${s.size ? `?${s}` : ''}`;
  };

  return (
    <div>
      <PageHeader
        title="Cold Room Stock"
        subtitle={`Live stock, oldest expiry sold first (FIFO) · ${fmtDate(todayISO())}`}
        actions={<>
          {canView(user.role, 'dispatch') && <Link href="/dispatch" className="btn-secondary">Dispatch</Link>}
          <Link href="/store/entries" className="btn-secondary">Return / damage</Link>
          <Link href="/store/count" className="btn-secondary">Daily count</Link>
          {canView(user.role, 'reports') && <Link href="/reports/coldroom" className="btn-primary">Cold room report</Link>}
        </>}
      />
      <Flash sp={sp} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon="snow" tone="blue" label="Products in stock" value={inStock.length} sub={`of ${all.length} products`} />
        <Stat icon="drop" tone="violet" label="Total in cold room" value={num(litres)} unit="L" sub="litres equivalent (kg as litres)" />
        <Stat icon="clock" tone={expiring.length ? 'red' : 'green'} label="Expiring by tomorrow" value={expiring.length} sub={expiring.length ? expiring.map((r) => r.p.name).slice(0, 3).join(', ') : 'nothing close to expiry'} />
        <Stat icon="alert" tone={negative.length ? 'red' : 'slate'} label="Negative stock" value={negative.length} sub={negative.length ? negative.map((r) => r.p.name).join(', ') : 'all products OK'} />
      </div>

      <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
        <form className="flex items-center gap-2">
          {cat && <input type="hidden" name="cat" value={cat} />}
          {showAll && <input type="hidden" name="all" value="1" />}
          <input name="q" defaultValue={sp?.q || ''} placeholder="Search product…" className="input w-56 py-1.5" />
        </form>
        <div className="flex flex-wrap gap-1.5">
          <Link href={link({ cat: '' })} className={`badge px-3 py-1 ${!cat ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}>All</Link>
          {PRODUCT_CATEGORIES.filter((c) => all.some((r) => r.p.category === c)).map((c) => (
            <Link key={c} href={link({ cat: c })} className={`badge px-3 py-1 ${cat === c ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}>{CAT_LABEL[c]}</Link>
          ))}
        </div>
        <Link href={link({ all: showAll ? '' : '1' })} className="ml-auto text-sm text-blue-600 hover:underline">{showAll ? 'Hide empty products' : 'Show empty products too'}</Link>
      </div>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Product</th><th>Category</th><th className="num">In stock</th><th className="num">≈ Litres</th><th>Nearest expiry</th><th>Lots (FIFO order)</th></tr></thead>
          <tbody>
            {list.map(({ p, lots, total, nearest }) => (
              <tr key={p.id} className={total < 0 ? 'bg-red-50/60' : ''}>
                <td><div className="font-medium text-slate-900">{p.name}</div><div className="text-xs text-slate-400">{p.code}</div></td>
                <td className="text-xs text-slate-600">{CAT_LABEL[p.category] || p.category}</td>
                <td className={`num text-base font-semibold ${total < 0 ? 'text-red-700' : 'text-slate-900'}`}>{qty(total)} <span className="text-xs font-normal text-slate-400">{p.unitName}</span></td>
                <td className="num text-slate-500">{num(total * p.litresPerUnit)}</td>
                <td><ExpiryBadge d={nearest} /></td>
                <td>
                  {lots.length === 0 ? <span className="text-xs text-slate-400">–</span> : (
                    <details>
                      <summary className="cursor-pointer text-xs text-blue-600">{lots.length} lot{lots.length > 1 ? 's' : ''}</summary>
                      <table className="mt-1 text-xs">
                        <tbody>
                          {lots.map((l) => (
                            <tr key={l.batchNo + isoOf(l.expiryDate)}>
                              <td className="py-0.5 pr-3 font-medium">{LOT_LABEL[l.batchNo] || l.batchNo || '–'}</td>
                              <td className="py-0.5 pr-3 text-slate-500">{l.expiryDate ? `exp ${bs(isoOf(l.expiryDate))}` : ''}</td>
                              <td className="py-0.5 text-right tabular-nums">{qty(l.qty)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <Empty>{q || cat ? 'No products match.' : 'Cold room is empty. Close a production batch, enter a receipt, or enter opening stock.'}</Empty>}
      </div>
    </div>
  );
}
