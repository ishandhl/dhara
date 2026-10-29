import Link from 'next/link';
import { todayISO, addDays, bs, bsMonthRange } from '@/lib/dates';

// One period picker for every report: quick buttons (incl. Nepali months), custom dates, previous / next.
export function reportPresets() {
  const today = todayISO();
  const cap = (r) => ({ ...r, to: r.to > today ? today : r.to });
  const thisM = cap(bsMonthRange(today, 0));
  const lastM = bsMonthRange(today, -1);
  return [
    { key: 'today', label: 'Today', from: today, to: today },
    { key: 'yesterday', label: 'Yesterday', from: addDays(today, -1), to: addDays(today, -1) },
    { key: '7d', label: 'Last 7 days', from: addDays(today, -6), to: today },
    { key: 'month', label: `This month (${thisM.label.split(' ')[0]})`, from: thisM.from, to: thisM.to },
    { key: 'lastmonth', label: `Last month (${lastM.label.split(' ')[0]})`, from: lastM.from, to: lastM.to },
  ];
}

/** Name of the period for headings: "Kartik 2083", "2083-07-12" or "2083-07-01 → 2083-07-12". */
export function periodLabel(from, to) {
  const m = bsMonthRange(from, 0);
  if (m.from === from && (m.to === to || (to === todayISO() && to < m.to))) return m.label + (m.to === to ? '' : ` (to ${bs(to)})`);
  return from === to ? `${bs(from)} BS` : `${bs(from)} → ${bs(to)} BS`;
}

export default function ReportBar({ base, from, to, extra = {} }) {
  const today = todayISO();
  const keep = Object.entries(extra).filter(([, v]) => v);
  const url = (f, t) => `${base}?${new URLSearchParams([['from', f], ['to', t], ...keep])}`;
  const presets = reportPresets();
  const active = presets.find((p) => p.from === from && p.to === to)?.key;

  // Previous / next: whole BS month if a month is shown, else the same number of days.
  const m = bsMonthRange(from, 0);
  const isMonth = m.from === from && (m.to === to || (to === today && to < m.to));
  let prev, next;
  if (isMonth) {
    const p = bsMonthRange(from, -1);
    const n = bsMonthRange(from, 1);
    prev = url(p.from, p.to);
    next = n.from <= today ? url(n.from, n.to > today ? today : n.to) : null;
  } else {
    const days = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
    prev = url(addDays(from, -days), addDays(to, -days));
    next = addDays(from, days) <= today ? url(addDays(from, days), addDays(to, days) > today ? today : addDays(to, days)) : null;
  }

  return (
    <div className="no-print card mb-5 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {presets.map((p) => (
          <Link key={p.key} href={url(p.from, p.to)} className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${active === p.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{p.label}</Link>
        ))}
        <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" />
        <Link href={prev} className="rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100" title="Previous period">← Prev</Link>
        {next ? <Link href={next} className="rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100" title="Next period">Next →</Link> : <span className="px-2.5 py-1.5 text-sm text-slate-300">Next →</span>}
      </div>
      <form action={base} className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
        {keep.map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <label><span className="label">From (AD)</span><input type="date" name="from" defaultValue={from} max={today} className="input py-1.5" /></label>
        <label><span className="label">To (AD)</span><input type="date" name="to" defaultValue={to} max={today} className="input py-1.5" /></label>
        <button className="btn-secondary py-1.5">Show</button>
        <span className="ml-auto self-center text-sm text-slate-500">Showing <b className="text-slate-800">{periodLabel(from, to)}</b></span>
      </form>
    </div>
  );
}
