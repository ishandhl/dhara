import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireView } from '@/lib/auth';
import { canEdit } from '@/lib/roles';
import { todayISO, toDateOnly, fmtDate, fmtTime, addDays } from '@/lib/dates';
import { num } from '@/lib/format';
import { getDensity } from '@/lib/tolerance';
import { Flash, PageHeader, StatusBadge, Empty, Stat, DateFilter } from '@/components/ui';

export default async function ReceivingPage({ searchParams }) {
  const sp = await searchParams;
  const user = await requireView('receiving');
  const date = sp?.date || todayISO();
  const density = await getDensity();
  const rows = await prisma.milkReceipt.findMany({ where: { date: toDateOnly(date) }, include: { supplier: true }, orderBy: { id: 'asc' } });
  const accepted = rows.filter((r) => r.status === 'ACCEPTED' || r.status === 'UNLOADED');
  const rejected = rows.filter((r) => r.status === 'REJECTED');
  const pending = rows.filter((r) => r.status === 'PENDING_QC').length;
  const accQ = accepted.reduce((a, r) => a + r.supplierQtyL, 0);
  const accFat = accQ ? accepted.reduce((a, r) => a + r.supplierQtyL * (r.fatPct || 0), 0) / accQ : null;
  const accSnf = accQ ? accepted.reduce((a, r) => a + r.supplierQtyL * (r.snfPct || 0), 0) / accQ : null;
  const kgFat = accQ && accFat !== null ? (accQ * density * accFat) / 100 : 0;
  const kgSnf = accQ && accSnf !== null ? (accQ * density * accSnf) / 100 : 0;

  return (
    <div>
      <PageHeader
        title="Milk Receiving"
        subtitle={fmtDate(date)}
        actions={<>
          <Link href={`/receiving?date=${addDays(date, -1)}`} className="btn-secondary">← Prev day</Link>
          <Link href={`/receiving?date=${addDays(date, 1)}`} className="btn-secondary">Next day →</Link>
          {canEdit(user.role, 'receiving') && <Link href="/receiving/new" className="btn-primary">+ New QC entry</Link>}
        </>}
      />
      <Flash sp={sp} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon="drop" tone="blue" label="Milk accepted" value={num(accQ)} unit="L" sub={`${accepted.length} tanker${accepted.length === 1 ? '' : 's'} accepted`} />
        <Stat icon="flask" tone="violet" label="Average fat / SNF" value={accFat === null ? '–' : `${accFat.toFixed(2)} / ${accSnf.toFixed(2)}`} unit={accFat === null ? '' : '%'} sub="weighted by litres" />
        <Stat icon="chart" tone="green" label="kg fat / kg SNF" value={`${num(kgFat)} / ${num(kgSnf)}`} sub={`at density ${density}`} />
        <Stat icon="alert" tone={rejected.length ? 'red' : 'slate'} label="Rejected / waiting QC" value={`${rejected.length} / ${pending}`} sub={rejected.length ? `${num(rejected.reduce((a, r) => a + r.supplierQtyL, 0))} L rejected` : 'none rejected'} />
      </div>
      <div className="mb-3"><DateFilter date={date} /></div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>No.</th><th>Time</th><th>Vehicle</th><th>Supplier</th><th className="num">Litres</th><th className="num">Temp °C</th><th className="num">Fat %</th><th className="num">Lacto</th><th className="num">SNF %</th><th>Adulteration</th><th>Status</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/receiving/${r.id}`} className="font-medium text-brand-600 hover:underline">{r.receiptNo}</Link></td>
                <td>{fmtTime(r.arrivedAt)}</td>
                <td>{r.vehicleNo}</td>
                <td>{r.supplier.name}</td>
                <td className="num">{num(r.supplierQtyL)}</td>
                <td className="num">{r.temperatureC ?? '–'}</td>
                <td className="num">{r.fatPct ?? '–'}</td>
                <td className="num">{r.lactoReading ?? '–'}</td>
                <td className="num">{r.snfPct ?? '–'}</td>
                <td className="text-xs">{!r.adulteration ? '–' : r.adulteration === 'NONE' ? 'None' : <span className="badge bg-red-100 text-red-800">{r.adulteration}</span>}</td>
                <td><StatusBadge status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>No tankers on this date.</Empty>}
      </div>
    </div>
  );
}
