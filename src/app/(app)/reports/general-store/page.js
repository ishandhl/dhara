import { requireView } from '@/lib/auth';
import { fmtDate } from '@/lib/dates';
import { qty } from '@/lib/format';
import { generalStoreRegister } from '@/lib/stock';
import { readPeriod } from '@/lib/period';
import { catLabel } from '@/lib/masters';
import { PageHeader, Stat } from '@/components/ui';
import PrintButton from '@/components/PrintButton';

export default async function GeneralStoreReport({ searchParams }) {
  const sp = await searchParams;
  await requireView('reports');
  const { from, to } = readPeriod(sp);
  const rows = await generalStoreRegister(from, to);
  const groups = [];
  for (const r of rows) {
    if (groups.at(-1)?.cat !== r.item.category) groups.push({ cat: r.item.category, rows: [] });
    groups.at(-1).rows.push(r);
  }
  return (
    <div>
      <PageHeader
        title="General Store Report"
        subtitle={from === to ? fmtDate(from) : `${fmtDate(from)} → ${fmtDate(to)}`}
        actions={<><a href={`/reports/general-store/export?from=${from}&to=${to}`} className="btn-primary no-print">Download Excel</a><PrintButton /></>}
      />
      <form className="no-print card mb-5 flex flex-wrap items-end gap-2 p-3">
        <label><span className="label">From</span><input type="date" name="from" defaultValue={from} className="input py-1.5" /></label>
        <label><span className="label">To</span><input type="date" name="to" defaultValue={to} className="input py-1.5" /></label>
        <button className="btn-secondary py-1.5">Show</button>
      </form>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon="box" tone="blue" label="Items" value={rows.length} sub={`${rows.filter((r) => r.closing > 0).length} in stock`} />
        <Stat icon="download" tone="green" label="Received" value={rows.filter((r) => r.received).length} sub="items purchased in period" />
        <Stat icon="arrowRight" tone="amber" label="Issued / used" value={rows.filter((r) => r.issued).length} sub="items issued in period" />
        <Stat icon="alert" tone={rows.some((r) => r.low) ? 'red' : 'slate'} label="At or below reorder" value={rows.filter((r) => r.low).length} sub="need buying" />
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-xs font-semibold text-slate-800">
              <th className="border border-slate-300 bg-slate-50 px-2 py-2 text-left">Item</th>
              <th className="border border-slate-300 bg-lime-400/80 px-2 py-2 text-right">Opening</th>
              <th className="border border-slate-300 bg-white px-2 py-2 text-right">Received</th>
              <th className="border border-slate-300 bg-yellow-300 px-2 py-2 text-right">Issued / used</th>
              <th className="border border-slate-300 bg-white px-2 py-2 text-right">Count adj.</th>
              <th className="border border-slate-300 bg-green-600 px-2 py-2 text-right text-white">Closing</th>
              <th className="border border-slate-300 bg-slate-50 px-2 py-2 text-right">Reorder at</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => [
              <tr key={g.cat}><td colSpan={7} className="border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">{catLabel(g.cat)}</td></tr>,
              ...g.rows.map((r) => (
                <tr key={r.item.id}>
                  <td className="border border-slate-200 px-2 py-1">{r.item.name} <span className="text-xs text-slate-400">{r.item.unit}</span></td>
                  <td className="num border border-slate-200 bg-lime-50 px-2 py-1">{qty(r.opening)}</td>
                  <td className="num border border-slate-200 px-2 py-1">{r.received ? qty(r.received) : ''}</td>
                  <td className="num border border-slate-200 bg-yellow-50 px-2 py-1">{r.issued ? qty(r.issued) : ''}</td>
                  <td className="num border border-slate-200 px-2 py-1">{r.adjust ? qty(r.adjust) : ''}</td>
                  <td className="num border border-slate-200 bg-green-50 px-2 py-1 font-semibold">{qty(r.closing)} {r.low && <span className="badge ml-1 bg-amber-100 text-amber-800">Low</span>}</td>
                  <td className="num border border-slate-200 px-2 py-1 text-slate-500">{r.item.reorderLevel === null ? '' : qty(r.item.reorderLevel)}</td>
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
    </div>
  );
}
