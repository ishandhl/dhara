import Link from 'next/link';
import { requireView } from '@/lib/auth';
import { fmtDate, bs, addDays } from '@/lib/dates';
import { qty, num } from '@/lib/format';
import { coldroomRegister } from '@/lib/stock';
import { readPeriod } from '@/lib/period';
import { PageHeader, Stat } from '@/components/ui';
import PrintButton from '@/components/PrintButton';
import Icon from '@/components/Icon';

// Header colours match the Excel coldroom record.
const COLS = [
  ['opening', 'Opening balance', 'bg-lime-400/80'],
  ['production', "Today's collection / production", 'bg-white'],
  ['going', 'Market going', 'bg-white'],
  ['returned', 'Market return', 'bg-orange-200'],
  ['damage', 'Used / damage', 'bg-yellow-300'],
  ['adjust', 'Count adj.', 'bg-white'],
  ['stock', 'Stock', 'bg-green-600 text-white'],
];
const CELL = { opening: 'bg-lime-50', returned: 'bg-orange-50', damage: 'bg-yellow-50', stock: 'bg-green-50 font-semibold' };
const CAT_LABEL = { MILK: 'Milk', CURD: 'Curd & dhau', CHEESE: 'Cheese', BUTTER: 'Butter', GHEE: 'Ghee', CREAM: 'Cream', OTHER: 'Other' };

export default async function ColdroomReport({ searchParams }) {
  const sp = await searchParams;
  await requireView('reports');
  const { from, to } = readPeriod(sp);
  const moved = sp?.moved === '1';
  const all = await coldroomRegister(from, to);
  const hasMovement = (r) => r.production || r.going || r.returned || r.damage || r.adjust || r.count !== null;
  const rows = moved ? all.filter(hasMovement) : all;
  const single = from === to;
  const q = `from=${from}&to=${to}`;
  const shift = (n) => `?from=${addDays(from, n)}&to=${addDays(to, n)}${moved ? '&moved=1' : ''}`;
  const L = (r, k) => r[k] * r.product.litresPerUnit;
  const total = (k) => all.reduce((a, r) => a + L(r, k), 0);
  const counted = all.filter((r) => r.count !== null);
  const mismatched = counted.filter((r) => Math.abs(r.diff) > 0.0001);

  // Group rows under a category heading, keeping the product order of the sheet.
  const groups = [];
  for (const r of rows) {
    if (groups.at(-1)?.cat !== r.product.category) groups.push({ cat: r.product.category, rows: [] });
    groups.at(-1).rows.push(r);
  }
  const td = 'border border-slate-200 px-2 py-1.5';

  return (
    <div>
      <PageHeader
        title="Cold Room Record"
        subtitle={single ? fmtDate(from) : `${fmtDate(from)} → ${fmtDate(to)}`}
        actions={<>
          <a href={`/reports/coldroom/export?${q}`} className="btn-primary"><Icon name="download" className="h-4 w-4" />Download Excel</a>
          <PrintButton />
        </>}
      />
      <div className="no-print card mb-5 flex flex-wrap items-end gap-2 p-3">
        <form className="flex flex-wrap items-end gap-2">
          <label><span className="label">From</span><input type="date" name="from" defaultValue={from} className="input py-1.5" /></label>
          <label><span className="label">To</span><input type="date" name="to" defaultValue={to} className="input py-1.5" /></label>
          {moved && <input type="hidden" name="moved" value="1" />}
          <button className="btn-secondary py-1.5">Show</button>
        </form>
        {single && <><Link href={shift(-1)} className="btn-secondary py-1.5">← Previous day</Link><Link href={shift(1)} className="btn-secondary py-1.5">Next day →</Link></>}
        <Link href={`?${q}${moved ? '' : '&moved=1'}`} className="ml-auto self-center text-sm text-blue-600 hover:underline">{moved ? 'Show all products' : 'Only products with movement'}</Link>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat icon="factory" tone="green" label="Production in" value={num(total('production'))} unit="L" sub="collection + batches + receipts" />
        <Stat icon="truck" tone="amber" label="Market going" value={num(total('going'))} unit="L" sub="dispatched on challans" />
        <Stat icon="swap" tone="blue" label="Market return" value={num(total('returned'))} unit="L" />
        <Stat icon="alert" tone="red" label="Used / damage" value={num(total('damage'))} unit="L" />
        <Stat icon="check" tone={mismatched.length ? 'red' : counted.length ? 'green' : 'slate'} label={`Count on ${bs(to)}`} value={counted.length ? `${mismatched.length} diff.` : 'Not counted'} sub={counted.length ? `${counted.length} products counted` : <Link href={`/store/count?date=${to}`} className="text-blue-600 hover:underline">Enter the count →</Link>} />
      </div>

      <p className="mb-2 text-xs text-slate-500">Stock = opening + production − market going + market return − used/damage ± count adjustment. Litre totals above count kg products as litres.</p>
      <div className="card max-h-[75vh] overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="text-xs font-semibold text-slate-800">
              <th className="sticky left-0 z-20 border border-slate-300 bg-slate-50 px-2 py-2 text-left">Name of product</th>
              {COLS.map(([k, label, cls]) => <th key={k} className={`border border-slate-300 px-2 py-2 text-right ${cls}`}>{label}</th>)}
              <th className="border border-slate-300 bg-sky-400 px-2 py-2 text-right text-white">Count record of coldroom</th>
              <th className="border border-slate-300 bg-orange-400 px-2 py-2 text-right">Different</th>
              <th className="border border-slate-300 bg-lime-300 px-2 py-2 text-left">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => [
              <tr key={`g-${g.cat}-${g.rows[0].product.id}`}><td colSpan={11} className="border border-slate-200 bg-slate-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-600">{CAT_LABEL[g.cat] || g.cat}</td></tr>,
              ...g.rows.map((r) => (
                <tr key={r.product.id} className={r.stock < 0 ? 'bg-red-50' : 'hover:bg-blue-50/40'}>
                  <td className={`${td} sticky left-0 whitespace-nowrap bg-white`}>{r.product.name} <span className="text-xs text-slate-400">{r.product.unitName}</span></td>
                  {COLS.map(([k]) => (
                    <td key={k} className={`num ${td} ${CELL[k] || ''} ${k === 'stock' && r.stock < 0 ? 'text-red-700' : ''}`}>
                      {k === 'opening' || k === 'stock' ? qty(r[k]) : r[k] ? qty(r[k]) : ''}
                    </td>
                  ))}
                  <td className={`num ${td} bg-sky-50`}>{r.count === null ? '' : qty(r.count)}</td>
                  <td className={`num ${td} bg-orange-50 ${r.diff ? 'font-semibold text-red-700' : ''}`}>{r.diff === null ? '' : `${r.diff > 0 ? '+' : ''}${qty(r.diff)}`}</td>
                  <td className={`${td} text-xs`}>{r.remark}</td>
                </tr>
              )),
            ])}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-6 text-center text-sm text-slate-400">No product had any movement in this period.</p>}
      </div>
    </div>
  );
}
