import Link from 'next/link';
import { requireView } from '@/lib/auth';
import { bs } from '@/lib/dates';
import { num, qty } from '@/lib/format';
import { readPeriod } from '@/lib/period';
import { dispatchReport } from '@/lib/reports';
import { PageHeader, Stat, Panel, Empty } from '@/components/ui';
import ReportBar, { periodLabel } from '@/components/ReportBar';
import BarChart from '@/components/BarChart';
import PrintButton from '@/components/PrintButton';
import Icon from '@/components/Icon';

const retPct = (v) => (v === null ? '–' : `${v.toFixed(1)}%`);

export default async function DispatchReport({ searchParams }) {
  const sp = await searchParams;
  await requireView('reports');
  const { from, to } = readPeriod(sp);
  const r = await dispatchReport(from, to);
  const t = r.total;
  const multi = from !== to;

  return (
    <div>
      <PageHeader
        title="Market Going & Returns"
        subtitle={periodLabel(from, to)}
        actions={<>
          <a href={`/reports/dispatch/export?from=${from}&to=${to}`} className="btn-primary"><Icon name="download" className="h-4 w-4" />Download Excel</a>
          <PrintButton />
        </>}
      />
      <ReportBar base="/reports/dispatch" from={from} to={to} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon="truck" tone="amber" label="Market going" value={num(t.litres)} unit="L" sub={`${t.challans} challans dispatched`} />
        <Stat icon="swap" tone="blue" label="Market return" value={num(t.returnedL)} unit="L" sub={`${retPct(t.returnPct)} of market going`} />
        <Stat icon="chart" tone="green" label="Net sold" value={num(t.litres - t.returnedL)} unit="L" sub="going − return" />
        <Stat icon="box" tone="violet" label="Distributors" value={t.distributors} sub="received goods" />
      </div>

      {multi && r.byDay.some((d) => d.litres || d.returnedL) && r.byDay.length <= 62 && (
        <Panel className="mb-5" title="Market going and return per day" subtitle="Litres; kg products counted as litres. Point at a bar for the exact figure.">
          <div className="px-4 py-4 sm:px-5">
            <BarChart labels={r.byDay.map((d) => bs(d.date).slice(5))} series={[{ name: 'Market going', values: r.byDay.map((d) => d.litres) }, { name: 'Market return', values: r.byDay.map((d) => d.returnedL) }]} />
          </div>
        </Panel>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="By distributor" subtitle="Highest quantity first">
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Distributor</th><th className="num">Challans</th><th className="num">Going (L)</th><th className="num">Return (L)</th><th className="num">Return %</th></tr></thead>
              <tbody>
                {r.byDistributor.map((d) => (
                  <tr key={d.name}>
                    <td><div className="font-medium text-slate-900">{d.name}</div>{d.route && <div className="text-xs text-slate-500">{d.route}</div>}</td>
                    <td className="num">{d.challans || '–'}</td>
                    <td className="num font-semibold">{num(d.litres)}</td>
                    <td className="num">{d.returnedL ? num(d.returnedL) : '–'}</td>
                    <td className={`num ${d.returnPct > 5 ? 'font-semibold text-red-700' : ''}`}>{retPct(d.returnPct)}</td>
                  </tr>
                ))}
              </tbody>
              {r.byDistributor.length > 1 && <tfoot><tr className="bg-slate-50 font-semibold"><td className="px-3 py-2.5">Total</td><td className="num px-3">{t.challans}</td><td className="num px-3">{num(t.litres)}</td><td className="num px-3">{num(t.returnedL)}</td><td className="num px-3">{retPct(t.returnPct)}</td></tr></tfoot>}
            </table>
            {!r.byDistributor.length && <Empty>Nothing dispatched in this period.</Empty>}
          </div>
        </Panel>
        <Panel title="By product">
          <div className="max-h-[32rem] overflow-auto">
            <table className="table">
              <thead className="sticky top-0"><tr><th>Product</th><th className="num">Market going</th><th className="num">Market return</th><th className="num">Going (L)</th></tr></thead>
              <tbody>
                {r.byProduct.map((p) => (
                  <tr key={p.name}>
                    <td className="font-medium text-slate-900">{p.name}</td>
                    <td className="num">{qty(p.units)} <span className="text-xs text-slate-400">{p.unit}</span></td>
                    <td className="num">{p.returned ? qty(p.returned) : '–'}</td>
                    <td className="num font-semibold">{num(p.litres, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!r.byProduct.length && <Empty>Nothing dispatched in this period.</Empty>}
          </div>
        </Panel>
      </div>

      {r.challans.length > 0 && (
        <Panel className="mt-5" title="Challans" subtitle="Click a challan to open or reprint it">
          <div className="max-h-[28rem] overflow-auto">
            <table className="table">
              <thead className="sticky top-0"><tr><th>Challan</th><th>Date (BS)</th><th>Distributor</th><th>Vehicle</th><th className="num">Lines</th><th className="num">Litres</th></tr></thead>
              <tbody>
                {r.challans.map((c) => (
                  <tr key={c.id}>
                    <td><Link href={`/dispatch/${c.id}`} className="font-medium text-brand-600 hover:underline">{c.challanNo}</Link></td>
                    <td className="whitespace-nowrap">{bs(c.date)}</td>
                    <td>{c.distributor?.name || '–'}</td>
                    <td className="whitespace-nowrap">{c.vehicle?.number || '–'}</td>
                    <td className="num">{c.lines.length}</td>
                    <td className="num font-semibold">{num(c.lines.reduce((a, l) => a + l.qty * l.product.litresPerUnit, 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      <p className="mt-4 text-xs text-slate-500">Dispatched challans only. Market return comes from the return entries in the cold room; returns without a distributor are listed as “No distributor”.</p>
    </div>
  );
}
