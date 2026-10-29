import Link from 'next/link';
import { requireView } from '@/lib/auth';
import { canEdit } from '@/lib/roles';
import { todayISO, fmtDate, fmtTime, addDays } from '@/lib/dates';
import { num } from '@/lib/format';
import { tankDay, tankStock } from '@/lib/milkTank';
import { recordTankReading, adjustTank } from './actions';
import { Flash, PageHeader, Field, Empty, Stat, Panel, DateFilter } from '@/components/ui';

const signed = (v) => `${v > 0 ? '+' : ''}${num(v)}`;

export default async function MilkTankPage({ searchParams }) {
  const sp = await searchParams;
  const user = await requireView('silos');
  const today = todayISO();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp?.date || '') && sp.date <= today ? sp.date : today;
  const isToday = date === today;
  const [d, now] = await Promise.all([tankDay(date), tankStock()]);
  const edit = canEdit(user.role, 'silos') && isToday;
  const manager = canEdit(user.role, 'approve') && isToday;
  const lastReading = d.dips[0];

  // Every entry of the day in time order, with a running balance.
  const lines = [
    ...d.receipts.map((r) => ({ at: r.qcAt || r.arrivedAt, kind: 'in', label: `QC accepted · ${r.supplier.name}`, sub: `${r.receiptNo} · ${r.vehicleNo}${r.fatPct ? ` · fat ${r.fatPct}%` : ''}`, href: `/receiving/${r.id}`, litres: r.supplierQtyL })),
    ...d.inputs.map((i) => ({ at: i.batch.createdAt, kind: 'out', label: 'To production', sub: `Batch ${i.batch.batchNo}`, href: `/production/${i.batchId}`, litres: -i.litres })),
    ...d.adjustments.map((a) => ({ at: a.createdAt, kind: 'adj', label: 'Adjustment (manager)', sub: a.note, litres: a.litres })),
  ].sort((a, b) => new Date(a.at) - new Date(b.at));
  let bal = d.opening;
  for (const l of lines) { bal += l.litres; l.balance = bal; }

  return (
    <div>
      <PageHeader
        title="Milk Tank"
        subtitle={`All accepted milk goes into one tank; milk allocated to production comes out of it. ${fmtDate(date)}`}
        actions={<DateFilter date={date} extra={<>{!isToday && <Link href="/silos" className="btn-secondary">Today</Link>}<Link href={`/silos?date=${addDays(date, -1)}`} className="btn-secondary">← Prev day</Link></>} />}
      />
      <Flash sp={sp} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="col-span-2 lg:col-span-1">
          <Stat icon="tank" tone="blue" label={isToday ? 'Milk in tank now' : 'Closing on this day'} value={num(isToday ? now : d.closing)} unit="L" sub={lastReading ? `measured ${num(lastReading.litres)} L (${signed(lastReading.varianceL)} L)` : 'system stock'} />
        </div>
        <Stat icon="clock" tone="slate" label="Opening" value={num(d.opening)} unit="L" sub="end of previous day" />
        <Stat icon="download" tone="green" label="In · QC accepted" value={num(d.inL)} unit="L" sub={`${d.receipts.length} tankers${d.fatIn ? ` · avg fat ${d.fatIn.toFixed(2)}%` : ''}`} />
        <Stat icon="factory" tone="amber" label="Out · to production" value={num(d.outL)} unit="L" sub={`${new Set(d.inputs.map((i) => i.batchId)).size} batches`} />
        <Stat icon="swap" tone={d.adjL ? 'violet' : 'slate'} label="Adjustments" value={signed(d.adjL)} unit="L" sub={d.adjustments.length ? `${d.adjustments.length} by manager` : 'none'} />
      </div>

      {(edit || manager) && (
        <div className="mb-5 grid gap-5 lg:grid-cols-2">
          {edit && (
            <form action={recordTankReading} className="card card-pad space-y-3">
              <h2 className="h2">Record measured milk</h2>
              <p className="text-xs text-slate-500">Measure the tank (dip or flow meter) and enter the litres. The system compares it with the expected {num(now)} L.</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Measured litres *"><input name="litres" type="number" inputMode="decimal" step="0.1" className="input" required /></Field>
                <Field label="When"><select name="kind" className="input" defaultValue="CLOSING"><option value="CLOSING">Closing (end of day)</option><option value="OPENING">Opening (morning)</option><option value="CHECK">Check</option></select></Field>
              </div>
              <Field label="Note"><input name="note" className="input" /></Field>
              <button className="btn-primary">Save reading</button>
            </form>
          )}
          {manager && (
            <form action={adjustTank} className="card card-pad space-y-3">
              <h2 className="h2">Adjust tank stock (manager)</h2>
              <p className="text-xs text-slate-500">Use it once for the <b>opening stock</b> when you start, or to book a measured difference, e.g. −120 L. Saved with your name and reason.</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Litres (+ or −) *"><input name="litres" type="number" inputMode="decimal" step="0.1" className="input" required /></Field>
                <Field label="Reason *"><input name="reason" className="input" required placeholder="Opening stock" /></Field>
              </div>
              <button className="btn-danger">Save adjustment</button>
            </form>
          )}
        </div>
      )}

      <Panel title={isToday ? "Today's movements" : 'Movements on this day'} subtitle="Click an entry to open the tanker or batch">
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Time</th><th>Entry</th><th className="num">In (L)</th><th className="num">Out (L)</th><th className="num">Balance (L)</th></tr></thead>
            <tbody>
              <tr className="bg-slate-50"><td /><td className="font-medium text-slate-600">Opening</td><td /><td /><td className="num font-semibold">{num(d.opening)}</td></tr>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap text-xs text-slate-500">{fmtTime(l.at)}</td>
                  <td>
                    {l.href ? <Link href={l.href} className="font-medium text-brand-600 hover:underline">{l.label}</Link> : <span className="font-medium text-slate-900">{l.label}</span>}
                    {l.sub && <div className="text-xs text-slate-500">{l.sub}</div>}
                  </td>
                  <td className="num text-emerald-700">{l.litres > 0 ? num(l.litres) : ''}</td>
                  <td className="num text-red-600">{l.litres < 0 ? num(-l.litres) : ''}</td>
                  <td className="num">{num(l.balance)}</td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-semibold"><td /><td>Closing</td><td className="num text-emerald-700">{num(d.inL + Math.max(0, d.adjL))}</td><td className="num text-red-600">{num(d.outL + Math.max(0, -d.adjL))}</td><td className="num">{num(d.closing)}</td></tr>
            </tbody>
          </table>
          {!lines.length && <Empty>No milk in or out on this day.</Empty>}
        </div>
      </Panel>

      {d.dips.length > 0 && (
        <Panel className="mt-5" title="Measured readings">
          <table className="table">
            <thead><tr><th>Time</th><th>When</th><th className="num">Measured (L)</th><th className="num">System (L)</th><th className="num">Difference (L)</th><th>Note</th></tr></thead>
            <tbody>
              {d.dips.map((x) => (
                <tr key={x.id}>
                  <td className="text-xs text-slate-500">{fmtTime(x.createdAt)}</td>
                  <td>{x.kind.charAt(0) + x.kind.slice(1).toLowerCase()}</td>
                  <td className="num">{num(x.litres)}</td>
                  <td className="num">{num(x.systemLitres)}</td>
                  <td className={`num font-semibold ${Math.abs(x.varianceL) > Math.max(20, x.systemLitres * 0.005) ? 'text-red-700' : 'text-slate-700'}`}>{signed(x.varianceL)}</td>
                  <td className="text-xs text-slate-500">{x.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
