import Link from 'next/link';
import { requireView } from '@/lib/auth';
import { bs } from '@/lib/dates';
import { num, qty } from '@/lib/format';
import { readPeriod } from '@/lib/period';
import { productionReport } from '@/lib/reports';
import { PageHeader, Stat, Panel, Empty, StatusBadge } from '@/components/ui';
import ReportBar, { periodLabel } from '@/components/ReportBar';
import BarChart from '@/components/BarChart';
import PrintButton from '@/components/PrintButton';
import Icon from '@/components/Icon';

export default async function ProductionReport({ searchParams }) {
  const sp = await searchParams;
  await requireView('reports');
  const { from, to } = readPeriod(sp);
  const r = await productionReport(from, to);
  const t = r.total;
  const multi = from !== to;

  return (
    <div>
      <PageHeader
        title="Production"
        subtitle={periodLabel(from, to)}
        actions={<>
          <a href={`/reports/production/export?from=${from}&to=${to}`} className="btn-primary"><Icon name="download" className="h-4 w-4" />Download Excel</a>
          <PrintButton />
        </>}
      />
      <ReportBar base="/reports/production" from={from} to={to} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon="drop" tone="blue" label="Milk used" value={num(t.milkL)} unit="L" sub={`${t.batches} batches${t.open ? ` · ${t.open} still open` : ''}`} />
        <Stat icon="factory" tone="green" label="Products packed" value={num(t.packedL)} unit="L" sub={`${r.products.length} products`} />
        <Stat icon="swap" tone="violet" label="By-products" value={num(t.byL)} unit="L" sub={r.byProducts.map((b) => b.name).join(', ') || 'none'} />
        <Stat icon="alert" tone={t.lossPct > 2 ? 'red' : t.lossPct === null ? 'slate' : 'amber'} label="Loss" value={t.lossPct === null ? '–' : t.lossPct.toFixed(2)} unit={t.lossPct === null ? '' : '%'} sub={t.lossPct === null ? 'no closed batches' : `${num(t.lossL)} L, closed batches`} />
      </div>

      {multi && r.byDay.some((d) => d.batches) && r.byDay.length <= 62 && (
        <Panel className="mb-5" title="Milk used and packed per day" subtitle="Point at a bar for the exact figure.">
          <div className="px-4 py-4 sm:px-5">
            <BarChart labels={r.byDay.map((d) => bs(d.date).slice(5))} series={[{ name: 'Milk used', values: r.byDay.map((d) => d.milkL) }, { name: 'Packed', values: r.byDay.map((d) => d.packedL) }]} />
          </div>
        </Panel>
      )}

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Products packed">
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Product</th><th className="num">Quantity</th><th className="num">Litres / kg</th></tr></thead>
              <tbody>
                {r.products.map((p) => (
                  <tr key={p.name}><td className="font-medium text-slate-900">{p.name}</td><td className="num">{qty(p.units)} <span className="text-xs text-slate-400">{p.unit}</span></td><td className="num font-semibold">{num(p.litres, 1)}</td></tr>
                ))}
              </tbody>
              {r.products.length > 1 && <tfoot><tr className="bg-slate-50 font-semibold"><td className="px-3 py-2.5">Total</td><td /><td className="num px-3">{num(t.packedL, 1)}</td></tr></tfoot>}
            </table>
            {!r.products.length && <Empty>Nothing packed in this period.</Empty>}
          </div>
        </Panel>
        <div className="space-y-5">
          <Panel title="Ingredients added" subtitle="SMP, sugar, culture … taken from the general store">
            <table className="table">
              <tbody>
                {r.ingredients.map((i) => <tr key={i.name}><td>{i.name}</td><td className="num font-semibold">{qty(i.qty)} <span className="text-xs font-normal text-slate-400">{i.unit}</span></td></tr>)}
              </tbody>
            </table>
            {!r.ingredients.length && <Empty>No ingredients added.</Empty>}
          </Panel>
          {r.byProducts.length > 0 && (
            <Panel title="By-products">
              <table className="table"><tbody>{r.byProducts.map((b) => <tr key={b.name}><td>{b.name}</td><td className="num font-semibold">{num(b.litres, 1)} L</td></tr>)}</tbody></table>
            </Panel>
          )}
        </div>
      </div>

      <Panel className="mt-5" title="Batches" subtitle="Click a batch to open it">
        <div className="max-h-[32rem] overflow-auto">
          <table className="table">
            <thead className="sticky top-0"><tr><th>Batch</th><th>Date (BS)</th><th>Status</th><th className="num">Milk in (L)</th><th className="num">Packed (L)</th><th className="num">By-products (L)</th><th className="num">Loss %</th></tr></thead>
            <tbody>
              {r.batches.map((b) => (
                <tr key={b.id}>
                  <td><Link href={`/production/${b.id}`} className="font-medium text-brand-600 hover:underline">{b.batchNo}</Link></td>
                  <td className="whitespace-nowrap">{bs(b.date)}</td>
                  <td><StatusBadge status={b.status} /></td>
                  <td className="num">{num(b.s.inputL)}</td>
                  <td className="num font-semibold">{num(b.s.packedL)}</td>
                  <td className="num">{b.s.byL ? num(b.s.byL) : '–'}</td>
                  <td className={`num ${b.status === 'CLOSED' && b.s.totalLossPct > 2 ? 'font-semibold text-red-700' : ''}`}>{b.status === 'CLOSED' && b.s.totalLossPct !== null ? b.s.totalLossPct.toFixed(2) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!r.batches.length && <Empty>No batches in this period.</Empty>}
        </div>
      </Panel>
      <p className="mt-4 text-xs text-slate-500">Loss = milk in − packed − by-products, counted for closed batches only. kg products are counted as litres in the totals.</p>
    </div>
  );
}
