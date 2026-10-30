import Link from 'next/link';
import { requireView } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { bs, isoOf } from '@/lib/dates';
import { num } from '@/lib/format';
import { readPeriod } from '@/lib/period';
import { milkReport, tankerSolids } from '@/lib/reports';
import { PageHeader, Stat, Panel, Empty } from '@/components/ui';
import ReportBar, { periodLabel } from '@/components/ReportBar';
import BarChart from '@/components/BarChart';
import PrintButton from '@/components/PrintButton';
import AutoSubmitSelect from '@/components/AutoSubmitSelect';
import Icon from '@/components/Icon';

const pct = (v) => (v === null || v === undefined ? '–' : v.toFixed(2));
const problemNote = (p) => [p.adulteration && p.adulteration.toUpperCase() !== 'NONE' ? p.adulteration : null, p.rejectReason].filter(Boolean).join(' · ');

function Result({ status }) {
  if (status === 'REJECTED') return <span className="badge bg-red-100 text-red-800">Rejected</span>;
  if (status === 'PENDING_QC') return <span className="badge bg-slate-100 text-slate-700">Waiting QC</span>;
  return <span className="badge bg-green-100 text-green-800">Accepted</span>;
}

export default async function MilkReport({ searchParams }) {
  const sp = await searchParams;
  await requireView('reports');
  const { from, to } = readPeriod(sp);
  const supplierId = Number(sp.supplier) || null;
  const [r, suppliers] = await Promise.all([
    milkReport(from, to, supplierId),
    prisma.supplier.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }], select: { id: true, name: true, active: true } }),
  ]);
  const sup = r.supplier;
  const t = r.total;
  const multi = from !== to;
  const days = r.byDay.filter((d) => d.tankers);
  const link = (f, tt, s = sup?.id) => `/reports/milk?${new URLSearchParams([['from', f], ['to', tt], ...(s ? [['supplier', s]] : [])])}`;
  const showTankers = sup || !multi;

  return (
    <div>
      <PageHeader
        title={sup ? `Milk Collection · ${sup.name}` : 'Milk Collection'}
        subtitle={periodLabel(from, to)}
        actions={<>
          <a href={`/reports/milk/export?${new URLSearchParams([['from', from], ['to', to], ...(sup ? [['supplier', sup.id]] : [])])}`} className="btn-primary"><Icon name="download" className="h-4 w-4" />Download Excel</a>
          <PrintButton />
        </>}
      />

      <form action="/reports/milk" className="no-print card mb-3 flex flex-wrap items-end gap-2 p-3">
        <input type="hidden" name="from" value={from} />
        <input type="hidden" name="to" value={to} />
        <label className="min-w-0 flex-1 sm:max-w-sm">
          <span className="label">Supplier</span>
          <AutoSubmitSelect name="supplier" defaultValue={sup?.id || ''} className="input py-1.5">
            <option value="">All suppliers</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.active ? '' : ' (inactive)'}</option>)}
          </AutoSubmitSelect>
        </label>
        <noscript><button className="btn-secondary py-1.5">Show</button></noscript>
        {sup && <Link href={link(from, to, null)} className="btn-secondary py-1.5">Show all suppliers</Link>}
      </form>
      <ReportBar base="/reports/milk" from={from} to={to} extra={{ supplier: sup?.id }} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat icon="drop" tone="blue" label="Milk accepted" value={num(t.litres)} unit="L" sub={`${t.tankers} tankers${t.pending ? ` · ${t.pending} waiting QC` : ''}`} />
        <Stat icon="flask" tone="violet" label="Average fat / SNF" value={t.fat === null ? '–' : `${t.fat.toFixed(2)} / ${t.snf.toFixed(2)}`} unit={t.fat === null ? '' : '%'} sub="weighted by litres" />
        <Stat icon="chart" tone="green" label="kg fat" value={num(t.kgFat)} unit="kg" sub={`kg SNF ${num(t.kgSnf)} · density ${r.density}`} />
        <Stat icon="alert" tone={t.rejected ? 'red' : 'slate'} label="Rejected" value={t.rejected} unit={t.rejected === 1 ? 'tanker' : 'tankers'} sub={t.rejected ? `${num(t.rejectedL)} L sent back` : 'none'} />
        <Stat icon="alert" tone={t.adulterated ? 'amber' : 'slate'} label="Adulteration found" value={t.adulterated} sub={t.adulterated ? 'see the list below' : 'none'} />
      </div>

      {r.byMonth.length > 1 ? (
        <Panel className="mb-5" title="Milk accepted per month" subtitle="Litres accepted at QC. Point at a bar for the exact figure.">
          <div className="px-4 py-4 sm:px-5">
            <BarChart labels={r.byMonth.map((m) => m.label.slice(0, 3))} series={[{ name: 'Milk accepted', values: r.byMonth.map((m) => m.litres) }]} />
          </div>
        </Panel>
      ) : multi && days.length > 1 && (
        <Panel className="mb-5" title="Milk accepted per day" subtitle="Litres accepted at QC. Point at a bar for the exact figure.">
          <div className="px-4 py-4 sm:px-5">
            <BarChart labels={r.byDay.map((d) => bs(d.date).slice(5))} series={[{ name: 'Milk accepted', values: r.byDay.map((d) => d.litres) }]} />
          </div>
        </Panel>
      )}

      {r.byMonth.length > 1 && (
        <Panel className="mb-5" title="By month" subtitle="Click a month to see its days">
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Month (BS)</th><th className="num">Tankers</th><th className="num">Accepted (L)</th><th className="num">Fat %</th><th className="num">SNF %</th><th className="num">kg fat</th><th className="num">kg SNF</th><th className="num">Rejected</th></tr></thead>
              <tbody>
                {r.byMonth.map((m) => (
                  <tr key={m.from}>
                    <td><Link href={link(m.from, m.to)} className="font-medium text-brand-600 hover:underline">{m.label}</Link></td>
                    <td className="num">{m.tankers}</td>
                    <td className="num font-semibold">{num(m.litres)}</td>
                    <td className="num">{pct(m.fat)}</td>
                    <td className="num">{pct(m.snf)}</td>
                    <td className="num">{num(m.kgFat, 1)}</td>
                    <td className="num">{num(m.kgSnf, 1)}</td>
                    <td className={`num ${m.rejected ? 'font-semibold text-red-700' : 'text-slate-400'}`}>{m.rejected || '–'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="bg-slate-50 font-semibold"><td className="px-3 py-2.5">Total</td><td className="num px-3">{t.tankers}</td><td className="num px-3">{num(t.litres)}</td><td className="num px-3">{pct(t.fat)}</td><td className="num px-3">{pct(t.snf)}</td><td className="num px-3">{num(t.kgFat, 1)}</td><td className="num px-3">{num(t.kgSnf, 1)}</td><td className="num px-3">{t.rejected || '–'}</td></tr></tfoot>
            </table>
          </div>
        </Panel>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        {!sup && (
          <Panel title="By supplier" subtitle="Highest quantity first. Click a supplier to see only their milk.">
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Supplier</th><th className="num">Tankers</th><th className="num">Accepted (L)</th><th className="num">Fat %</th><th className="num">SNF %</th><th className="num">kg fat</th><th className="num">Rejected</th></tr></thead>
                <tbody>
                  {r.bySupplier.map((s) => (
                    <tr key={s.id}>
                      <td><Link href={link(from, to, s.id)} className="font-medium text-brand-600 hover:underline">{s.name}</Link>{s.adulterated > 0 && <span className="badge ml-2 whitespace-nowrap bg-amber-100 text-amber-800">{s.adulterated} adulterated</span>}</td>
                      <td className="num">{s.tankers}</td>
                      <td className="num font-semibold">{num(s.litres)}</td>
                      <td className="num">{pct(s.fat)}</td>
                      <td className="num">{pct(s.snf)}</td>
                      <td className="num">{num(s.kgFat, 1)}</td>
                      <td className={`num ${s.rejected ? 'font-semibold text-red-700' : 'text-slate-400'}`}>{s.rejected || '–'}</td>
                    </tr>
                  ))}
                </tbody>
                {r.bySupplier.length > 1 && (
                  <tfoot><tr className="bg-slate-50 font-semibold"><td className="px-3 py-2.5">Total</td><td className="num px-3">{t.tankers}</td><td className="num px-3">{num(t.litres)}</td><td className="num px-3">{pct(t.fat)}</td><td className="num px-3">{pct(t.snf)}</td><td className="num px-3">{num(t.kgFat, 1)}</td><td className="num px-3">{t.rejected || '–'}</td></tr></tfoot>
                )}
              </table>
              {!r.bySupplier.length && <Empty>No milk received in this period.</Empty>}
            </div>
          </Panel>
        )}

        {multi && (
          <Panel title="By day" className={sup ? 'xl:col-span-2' : ''}>
            <div className="max-h-[32rem] overflow-auto">
              <table className="table">
                <thead className="sticky top-0"><tr><th>Date (BS)</th><th className="num">Tankers</th><th className="num">Accepted (L)</th><th className="num">Fat %</th><th className="num">SNF %</th><th className="num">Rejected</th></tr></thead>
                <tbody>
                  {days.map((d) => (
                    <tr key={d.date}>
                      <td><Link href={link(d.date, d.date)} className="text-brand-600 hover:underline">{bs(d.date)}</Link></td>
                      <td className="num">{d.tankers}</td>
                      <td className="num font-semibold">{num(d.litres)}</td>
                      <td className="num">{pct(d.fat)}</td>
                      <td className="num">{pct(d.snf)}</td>
                      <td className={`num ${d.rejected ? 'font-semibold text-red-700' : 'text-slate-400'}`}>{d.rejected || '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!days.length && <Empty>No milk received in this period.</Empty>}
            </div>
          </Panel>
        )}
      </div>

      {showTankers && (
        <Panel className="mt-5" title="Every tanker" subtitle={`${r.receipts.length} ${r.receipts.length === 1 ? 'tanker' : 'tankers'}${sup ? ` from ${sup.name}` : ''}. Click a receipt to see the full QC record.`}>
          <div className="max-h-[40rem] overflow-auto">
            <table className="table">
              <thead className="sticky top-0"><tr><th>Date (BS)</th><th>Receipt</th>{!sup && <th>Supplier</th>}<th>Vehicle</th><th className="num">Litres</th><th className="num">Fat %</th><th className="num">SNF %</th><th className="num">kg fat</th><th>Result</th></tr></thead>
              <tbody>
                {r.receipts.map((p) => (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap">{bs(isoOf(p.date))}</td>
                    <td><Link href={`/receiving/${p.id}`} className="text-brand-600 hover:underline">{p.receiptNo}</Link></td>
                    {!sup && <td>{p.supplier.name}</td>}
                    <td className="whitespace-nowrap">{p.vehicleNo}</td>
                    <td className="num font-semibold">{num(p.supplierQtyL)}</td>
                    <td className="num">{pct(p.fatPct)}</td>
                    <td className="num">{pct(p.snfPct)}</td>
                    <td className="num">{num(tankerSolids(p, r.density).kgFat, 1)}</td>
                    <td className="whitespace-nowrap"><Result status={p.status} />{problemNote(p) && <span className="ml-2 text-xs text-slate-500">{problemNote(p)}</span>}</td>
                  </tr>
                ))}
              </tbody>
              {r.receipts.length > 1 && (
                <tfoot><tr className="bg-slate-50 font-semibold"><td className="px-3 py-2.5" colSpan={sup ? 3 : 4}>Total accepted</td><td className="num px-3">{num(t.litres)}</td><td className="num px-3">{pct(t.fat)}</td><td className="num px-3">{pct(t.snf)}</td><td className="num px-3">{num(t.kgFat, 1)}</td><td /></tr></tfoot>
              )}
            </table>
            {!r.receipts.length && <Empty>No milk received in this period.</Empty>}
          </div>
        </Panel>
      )}

      {!showTankers && r.problems.length > 0 && (
        <Panel className="mt-5" title="Rejected or adulterated milk" subtitle="Click a receipt to see the full QC record">
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Date (BS)</th><th>Receipt</th><th>Supplier</th><th>Vehicle</th><th className="num">Litres</th><th>Result</th><th>Adulteration / reason</th></tr></thead>
              <tbody>
                {r.problems.map((p) => (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap">{bs(isoOf(p.date))}</td>
                    <td><Link href={`/receiving/${p.id}`} className="text-brand-600 hover:underline">{p.receiptNo}</Link></td>
                    <td>{p.supplier.name}</td>
                    <td className="whitespace-nowrap">{p.vehicleNo}</td>
                    <td className="num">{num(p.supplierQtyL)}</td>
                    <td><Result status={p.status} /></td>
                    <td className="text-sm">{problemNote(p) || '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      <p className="mt-4 text-xs text-slate-500">Totals count accepted milk only (rejected and cancelled tankers are left out). Fat and SNF are averages weighted by litres.</p>
    </div>
  );
}
