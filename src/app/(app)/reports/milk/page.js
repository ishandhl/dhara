import Link from 'next/link';
import { requireView } from '@/lib/auth';
import { bs, fmtDate } from '@/lib/dates';
import { num } from '@/lib/format';
import { readPeriod } from '@/lib/period';
import { milkReport } from '@/lib/reports';
import { PageHeader, Stat, Panel, Empty } from '@/components/ui';
import ReportBar, { periodLabel } from '@/components/ReportBar';
import BarChart from '@/components/BarChart';
import PrintButton from '@/components/PrintButton';
import Icon from '@/components/Icon';

export default async function MilkReport({ searchParams }) {
  const sp = await searchParams;
  await requireView('reports');
  const { from, to } = readPeriod(sp);
  const r = await milkReport(from, to);
  const t = r.total;
  const multi = from !== to;
  const days = r.byDay.filter((d) => d.tankers);

  return (
    <div>
      <PageHeader
        title="Milk Collection"
        subtitle={periodLabel(from, to)}
        actions={<>
          <a href={`/reports/milk/export?from=${from}&to=${to}`} className="btn-primary"><Icon name="download" className="h-4 w-4" />Download Excel</a>
          <PrintButton />
        </>}
      />
      <ReportBar base="/reports/milk" from={from} to={to} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat icon="drop" tone="blue" label="Milk accepted" value={num(t.litres)} unit="L" sub={`${t.tankers} tankers${t.pending ? ` · ${t.pending} waiting QC` : ''}`} />
        <Stat icon="flask" tone="violet" label="Average fat / SNF" value={t.fat === null ? '–' : `${t.fat.toFixed(2)} / ${t.snf.toFixed(2)}`} unit={t.fat === null ? '' : '%'} sub="weighted by litres" />
        <Stat icon="chart" tone="green" label="kg fat" value={num(t.kgFat)} unit="kg" sub={`kg SNF ${num(t.kgSnf)} · density ${r.density}`} />
        <Stat icon="alert" tone={t.rejected ? 'red' : 'slate'} label="Rejected" value={t.rejected} unit={t.rejected === 1 ? 'tanker' : 'tankers'} sub={t.rejected ? `${num(t.rejectedL)} L sent back` : 'none'} />
        <Stat icon="alert" tone={t.adulterated ? 'amber' : 'slate'} label="Adulteration found" value={t.adulterated} sub={t.adulterated ? 'see the list below' : 'none'} />
      </div>

      {multi && days.length > 1 && r.byDay.length <= 62 && (
        <Panel className="mb-5" title="Milk accepted per day" subtitle="Litres accepted at QC. Point at a bar for the exact figure.">
          <div className="px-4 py-4 sm:px-5">
            <BarChart labels={r.byDay.map((d) => bs(d.date).slice(5))} series={[{ name: 'Milk accepted', values: r.byDay.map((d) => d.litres) }]} />
          </div>
        </Panel>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="By supplier" subtitle="Highest quantity first">
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Supplier</th><th className="num">Tankers</th><th className="num">Accepted (L)</th><th className="num">Fat %</th><th className="num">SNF %</th><th className="num">kg fat</th><th className="num">Rejected</th></tr></thead>
              <tbody>
                {r.bySupplier.map((s) => (
                  <tr key={s.name}>
                    <td className="font-medium text-slate-900">{s.name}{s.adulterated > 0 && <span className="badge ml-2 whitespace-nowrap bg-amber-100 text-amber-800">{s.adulterated} adulterated</span>}</td>
                    <td className="num">{s.tankers}</td>
                    <td className="num font-semibold">{num(s.litres)}</td>
                    <td className="num">{s.fat === null ? '–' : s.fat.toFixed(2)}</td>
                    <td className="num">{s.snf === null ? '–' : s.snf.toFixed(2)}</td>
                    <td className="num">{num(s.kgFat, 1)}</td>
                    <td className={`num ${s.rejected ? 'font-semibold text-red-700' : 'text-slate-400'}`}>{s.rejected || '–'}</td>
                  </tr>
                ))}
              </tbody>
              {r.bySupplier.length > 1 && (
                <tfoot><tr className="bg-slate-50 font-semibold"><td className="px-3 py-2.5">Total</td><td className="num px-3">{t.tankers}</td><td className="num px-3">{num(t.litres)}</td><td className="num px-3">{t.fat === null ? '–' : t.fat.toFixed(2)}</td><td className="num px-3">{t.snf === null ? '–' : t.snf.toFixed(2)}</td><td className="num px-3">{num(t.kgFat, 1)}</td><td className="num px-3">{t.rejected || '–'}</td></tr></tfoot>
              )}
            </table>
            {!r.bySupplier.length && <Empty>No milk received in this period.</Empty>}
          </div>
        </Panel>

        {multi ? (
          <Panel title="By day">
            <div className="max-h-[32rem] overflow-auto">
              <table className="table">
                <thead className="sticky top-0"><tr><th>Date (BS)</th><th className="num">Tankers</th><th className="num">Accepted (L)</th><th className="num">Fat %</th><th className="num">SNF %</th><th className="num">Rejected</th></tr></thead>
                <tbody>
                  {days.map((d) => (
                    <tr key={d.date}>
                      <td><Link href={`/reports/milk?from=${d.date}&to=${d.date}`} className="text-brand-600 hover:underline">{bs(d.date)}</Link></td>
                      <td className="num">{d.tankers}</td>
                      <td className="num font-semibold">{num(d.litres)}</td>
                      <td className="num">{d.fat === null ? '–' : d.fat.toFixed(2)}</td>
                      <td className="num">{d.snf === null ? '–' : d.snf.toFixed(2)}</td>
                      <td className={`num ${d.rejected ? 'font-semibold text-red-700' : 'text-slate-400'}`}>{d.rejected || '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!days.length && <Empty>No milk received in this period.</Empty>}
            </div>
          </Panel>
        ) : (
          <Panel title="Tankers on this day" action={<Link href={`/receiving?date=${from}`} className="text-sm text-brand-600 hover:underline">Open receiving →</Link>}>
            <p className="px-5 py-4 text-sm text-slate-600">{t.tankers ? `${t.tankers} tankers arrived on ${fmtDate(from)}. Open receiving to see each one with its temperature, fat, lacto and SNF.` : 'No tankers on this day.'}</p>
          </Panel>
        )}
      </div>

      {r.problems.length > 0 && (
        <Panel className="mt-5" title="Rejected or adulterated milk" subtitle="Click a receipt to see the full QC record">
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Date (BS)</th><th>Receipt</th><th>Supplier</th><th>Vehicle</th><th className="num">Litres</th><th>Result</th><th>Adulteration / reason</th></tr></thead>
              <tbody>
                {r.problems.map((p) => (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap">{bs(p.date)}</td>
                    <td><Link href={`/receiving/${p.id}`} className="text-brand-600 hover:underline">{p.receiptNo}</Link></td>
                    <td>{p.supplier.name}</td>
                    <td className="whitespace-nowrap">{p.vehicleNo}</td>
                    <td className="num">{num(p.supplierQtyL)}</td>
                    <td>{p.status === 'REJECTED' ? <span className="badge bg-red-100 text-red-800">Rejected</span> : <span className="badge bg-amber-100 text-amber-800">Accepted</span>}</td>
                    <td className="text-sm">{[p.adulteration && p.adulteration.toUpperCase() !== 'NONE' ? p.adulteration : null, p.rejectReason].filter(Boolean).join(' · ') || '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      <p className="mt-4 text-xs text-slate-500">Accepted milk only (rejected and cancelled tankers are not in the totals). Fat and SNF are averages weighted by litres.</p>
    </div>
  );
}
