import Link from 'next/link';
import { requireView } from '@/lib/auth';
import { canView } from '@/lib/roles';
import { readPeriod } from '@/lib/period';
import { num } from '@/lib/format';
import { milkReport, productionReport, dispatchReport } from '@/lib/reports';
import { PageHeader, Stat } from '@/components/ui';
import ReportBar, { periodLabel, reportPresets } from '@/components/ReportBar';
import Icon from '@/components/Icon';

export default async function ReportsPage({ searchParams }) {
  const sp = await searchParams;
  const user = await requireView('reports');
  // Opens on this Nepali month; the bar switches the period for the summary and every report link.
  const month = reportPresets().find((p) => p.key === 'month');
  const { from, to } = sp?.from || sp?.to ? readPeriod(sp) : month;
  const q = `from=${from}&to=${to}`;
  const [milk, prod, disp] = await Promise.all([milkReport(from, to), productionReport(from, to), dispatchReport(from, to)]);

  const REPORTS = [
    { href: '/reports/milk', icon: 'flask', title: 'Milk Collection', text: 'Milk accepted by day and by supplier, average fat / SNF, kg fat and SNF, rejected and adulterated tankers.' },
    { href: '/reports/production', icon: 'factory', title: 'Production', text: 'Milk used, products packed, ingredients added (SMP …), by-products and loss % for every batch.' },
    { href: '/reports/coldroom', icon: 'snow', title: 'Cold Room Record', text: 'Same layout as the Excel record: opening, production, market going, return, used / damage, stock, count and difference.' },
    { href: '/reports/dispatch', icon: 'truck', title: 'Market Going & Returns', text: 'What went to each distributor and came back, by product, with return % and every challan.' },
    { href: '/reports/general-store', icon: 'box', title: 'General Store', text: 'Opening, received, issued and closing for ingredients, packaging, cups, plastic and chemicals, with low-stock flags.' },
    ...(canView(user.role, 'audit') ? [{ href: '/audit', icon: 'clock', title: 'Audit Log', text: 'Who entered, changed or cancelled what, and when.', noPeriod: true }] : []),
  ];

  return (
    <div>
      <PageHeader title="Reports" subtitle={`Summary for ${periodLabel(from, to)}. Pick a period, then open any report for the same period. Every report prints and downloads as Excel.`} />
      <ReportBar base="/reports" from={from} to={to} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat href={`/reports/milk?${q}`} icon="drop" tone="blue" label="Milk accepted" value={num(milk.total.litres)} unit="L" sub={milk.total.fat === null ? `${milk.total.tankers} tankers` : `fat ${milk.total.fat.toFixed(2)}% · SNF ${milk.total.snf.toFixed(2)}%`} />
        <Stat href={`/reports/production?${q}`} icon="factory" tone="green" label="Products packed" value={num(prod.total.packedL)} unit="L" sub={`from ${num(prod.total.milkL)} L milk · ${prod.total.batches} batches`} />
        <Stat href={`/reports/production?${q}`} icon="alert" tone={prod.total.lossPct > 2 ? 'red' : 'amber'} label="Production loss" value={prod.total.lossPct === null ? '–' : prod.total.lossPct.toFixed(2)} unit={prod.total.lossPct === null ? '' : '%'} sub={prod.total.lossPct === null ? 'no closed batches' : `${num(prod.total.lossL)} L`} />
        <Stat href={`/reports/dispatch?${q}`} icon="truck" tone="amber" label="Market going" value={num(disp.total.litres)} unit="L" sub={`${disp.total.challans} challans`} />
        <Stat href={`/reports/dispatch?${q}`} icon="swap" tone="violet" label="Market return" value={num(disp.total.returnedL)} unit="L" sub={disp.total.returnPct === null ? 'nothing dispatched' : `${disp.total.returnPct.toFixed(1)}% of going`} />
      </div>

      <h2 className="h2 mb-3">All reports</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((r) => (
          <Link key={r.href} href={r.noPeriod ? r.href : `${r.href}?${q}`} className="card card-pad group flex gap-3 transition hover:border-blue-300 hover:shadow-md">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Icon name={r.icon} /></span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-semibold text-slate-900 group-hover:text-blue-700">{r.title} <span className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-500">→</span></div>
              <p className="mt-1 text-sm text-slate-500">{r.text}</p>
              {!r.noPeriod && <p className="mt-2 text-xs font-medium text-slate-400">{periodLabel(from, to)}</p>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
