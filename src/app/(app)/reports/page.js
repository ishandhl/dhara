import Link from 'next/link';
import { requireView } from '@/lib/auth';
import { todayISO, addDays } from '@/lib/dates';
import { PageHeader } from '@/components/ui';
import Icon from '@/components/Icon';

export default async function ReportsPage() {
  await requireView('reports');
  const today = todayISO();
  const REPORTS = [
    {
      href: '/reports/coldroom', icon: 'snow', title: 'Cold Room Record',
      text: 'Same layout as the Excel coldroom record: opening, production, market going, market return, used / damage, stock, count, difference and remarks for every product.',
      quick: [['Today', `/reports/coldroom?from=${today}&to=${today}`], ['Yesterday', `/reports/coldroom?from=${addDays(today, -1)}&to=${addDays(today, -1)}`], ['Last 7 days', `/reports/coldroom?from=${addDays(today, -6)}&to=${today}`]],
    },
    {
      href: '/reports/general-store', icon: 'box', title: 'General Store',
      text: 'Opening, received, issued, count adjustments and closing for ingredients, packaging, cups, plastic, chemicals and other items, with low-stock flags.',
      quick: [['Today', `/reports/general-store?from=${today}&to=${today}`], ['Last 7 days', `/reports/general-store?from=${addDays(today, -6)}&to=${today}`], ['Last 30 days', `/reports/general-store?from=${addDays(today, -29)}&to=${today}`]],
    },
    {
      href: '/receiving', icon: 'flask', title: 'Milk QC & Receiving',
      text: 'Tankers for any day with quantity, temperature, fat, lacto, SNF and adulteration, plus the day’s weighted fat / SNF and kg fat / kg SNF.',
      quick: [['Today', '/receiving'], ['Yesterday', `/receiving?date=${addDays(today, -1)}`]],
    },
    {
      href: '/production', icon: 'factory', title: 'Production',
      text: 'Batches with milk allocated, ingredients added, products packed and loss % for any period.',
      quick: [['Last 7 days', '/production'], ['Last 30 days', `/production?from=${addDays(today, -29)}&to=${today}`]],
    },
  ];
  return (
    <div>
      <PageHeader title="Reports" subtitle="Pick a report, then any date or period. Every report can be printed; the store reports also download as Excel." />
      <div className="grid gap-5 md:grid-cols-2">
        {REPORTS.map((r) => (
          <div key={r.href} className="card card-pad flex flex-col">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Icon name={r.icon} /></span>
              <div>
                <Link href={r.href} className="h2 hover:text-blue-700">{r.title}</Link>
                <p className="muted mt-1">{r.text}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 pl-[52px]">
              {r.quick.map(([label, href]) => <Link key={label} href={href} className="btn-secondary btn-sm">{label}</Link>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
