import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireView } from '@/lib/auth';
import { canEdit } from '@/lib/roles';
import { fmtDate, fmtDateTime } from '@/lib/dates';
import { num } from '@/lib/format';
import { correctReceipt, cancelReceipt } from '../actions';
import SubmitButton from '@/components/SubmitButton';
import { Flash, PageHeader, StatusBadge, Field } from '@/components/ui';

function Row({ k, v }) {
  return <div className="flex justify-between gap-4 border-b border-slate-100 py-1.5 text-sm"><span className="text-slate-500">{k}</span><span className="text-right font-medium">{v ?? '–'}</span></div>;
}

export default async function ReceiptDetail({ params, searchParams }) {
  const { id: idStr } = await params;
  const sp = await searchParams;
  const user = await requireView('receiving');
  const id = parseInt(idStr, 10);
  const rec = await prisma.milkReceipt.findUnique({ where: { id }, include: { supplier: true, tanker: true } });
  if (!rec) notFound();
  const userIds = [rec.createdById, rec.qcById].filter(Boolean);
  const users = Object.fromEntries((await prisma.user.findMany({ where: { id: { in: userIds } } })).map((u) => [u.id, u.name]));
  const manager = canEdit(user.role, 'approve');
  const fixable = manager && ['ACCEPTED', 'UNLOADED', 'REJECTED'].includes(rec.status);

  return (
    <div className="max-w-5xl">
      <PageHeader
        title={<span className="flex items-center gap-3">Tanker {rec.receiptNo} <StatusBadge status={rec.status} /></span>}
        subtitle={`${fmtDate(rec.date)} · ${rec.vehicleNo} · ${rec.supplier.name}`}
        actions={<Link href={`/receiving?date=${rec.date.toISOString().slice(0, 10)}`} className="btn-secondary">Back to list</Link>}
      />
      <Flash sp={sp} />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {(rec.status === 'ACCEPTED' || rec.status === 'UNLOADED') && (
            <div className="card card-pad border-emerald-200 bg-emerald-50 text-sm text-emerald-900">
              <b>Accepted.</b> {num(rec.supplierQtyL)} L added to the <Link href={`/silos?date=${rec.date.toISOString().slice(0, 10)}`} className="font-medium underline">milk tank</Link>.
            </div>
          )}
          {rec.status === 'REJECTED' && <div className="card card-pad border-red-200 bg-red-50 text-sm text-red-800"><b>Rejected:</b> {rec.rejectReason}</div>}
          {rec.status === 'CANCELLED' && <div className="card card-pad bg-slate-50 text-sm"><b>Cancelled:</b> {rec.cancelReason}</div>}
          {fixable && (
            <form action={correctReceipt.bind(null, id)} className="card card-pad space-y-3">
              <h2 className="h2">Correct a typo (Manager)</h2>
              <p className="text-xs text-slate-500">Keeps the receipt number and arrival time. SNF is worked out again. The old and new values go in the audit log.</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Milk quantity (L) *"><input name="supplierQtyL" type="number" inputMode="decimal" step="0.1" min="0" defaultValue={rec.supplierQtyL} className="input" required /></Field>
                <Field label="Fat % *"><input name="fatPct" type="number" inputMode="decimal" step="0.01" min="0" max="15" defaultValue={rec.fatPct ?? ''} className="input" required /></Field>
                <Field label="Lacto (CLR) *"><input name="lactoReading" type="number" inputMode="decimal" step="0.1" min="15" max="40" defaultValue={rec.lactoReading ?? ''} className="input" required /></Field>
                <Field label="Temperature (°C)"><input name="temperatureC" type="number" inputMode="decimal" step="0.1" defaultValue={rec.temperatureC ?? ''} className="input" /></Field>
                <Field label="Acidity %"><input name="acidityPct" type="number" inputMode="decimal" step="0.001" defaultValue={rec.acidityPct ?? ''} className="input" /></Field>
                <Field label="COB / Alcohol">
                  <div className="flex gap-2">
                    <select name="cobTest" defaultValue={rec.cobTest ?? ''} className="input"><option value="">COB –</option><option>PASS</option><option>FAIL</option></select>
                    <select name="alcoholTest" defaultValue={rec.alcoholTest ?? ''} className="input"><option value="">Alc. –</option><option>PASS</option><option>FAIL</option></select>
                  </div>
                </Field>
              </div>
              <Field label="What was wrong *"><input name="reason" className="input" placeholder="e.g. typed 10000 instead of 1000" required /></Field>
              <SubmitButton className="btn-secondary">Save correction</SubmitButton>
            </form>
          )}
        </div>
        <div className="space-y-5">
          <div className="card card-pad">
            <h2 className="h2 mb-2">Arrival</h2>
            <Row k="Arrived" v={fmtDateTime(rec.arrivedAt)} />
            <Row k="Milk quantity (slip)" v={`${num(rec.supplierQtyL)} L`} />
            {(rec.supplierFat !== null || rec.supplierSnf !== null) && <Row k="Supplier fat / SNF" v={`${rec.supplierFat ?? '–'} / ${rec.supplierSnf ?? '–'}`} />}
            <Row k="Temperature" v={rec.temperatureC !== null ? `${rec.temperatureC} °C` : null} />
            <Row k="Entered by" v={users[rec.createdById]} />
          </div>
          {rec.qcAt && (
            <div className="card card-pad">
              <h2 className="h2 mb-2">QC</h2>
              <Row k="Fat %" v={rec.fatPct} />
              {rec.lactoReading !== null && <Row k="Lacto (CLR)" v={rec.lactoReading} />}
              <Row k={rec.lactoReading !== null ? 'SNF % (calculated)' : 'SNF %'} v={rec.snfPct} />
              {rec.acidityPct !== null && <Row k="Acidity" v={rec.acidityPct} />}
              {(rec.cobTest || rec.alcoholTest) && <Row k="COB / Alcohol" v={`${rec.cobTest || '–'} / ${rec.alcoholTest || '–'}`} />}
              <Row k="Adulteration" v={rec.adulteration && rec.adulteration !== 'NONE' ? <span className="text-red-700">{rec.adulteration}</span> : 'None found'} />
              <Row k="Remarks" v={rec.qcRemarks} />
              <Row k="Tested by" v={`${users[rec.qcById]} · ${fmtDateTime(rec.qcAt)}`} />
            </div>
          )}
          {canEdit(user.role, 'approve') && rec.status !== 'CANCELLED' && (
            <form action={cancelReceipt.bind(null, id)} className="card card-pad space-y-2">
              <h2 className="h2">Cancel this entry</h2>
              <p className="text-xs text-slate-500">Only for an entry that should not exist (entered twice, wrong tanker). For a wrong number, use Correct instead. The record stays visible and its milk is taken out of the milk tank.</p>
              <input name="reason" placeholder="Reason *" className="input" required />
              <SubmitButton className="btn-danger btn-sm" confirm={`Cancel ${rec.receiptNo}?${rec.status === 'ACCEPTED' || rec.status === 'UNLOADED' ? ` ${num(rec.supplierQtyL)} L comes out of the milk tank.` : ''}`}>Cancel entry</SubmitButton>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
