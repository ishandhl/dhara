import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireView } from '@/lib/auth';
import { canEdit } from '@/lib/roles';
import { fmtDate, fmtDateTime } from '@/lib/dates';
import { num } from '@/lib/format';
import { saveQc, cancelReceipt } from '../actions';
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
  const canEnter = canEdit(user.role, 'receiving');

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
          {rec.status === 'PENDING_QC' && canEnter && (
            <form action={saveQc.bind(null, id)} className="card card-pad space-y-4">
              <h2 className="h2">Step 2 · QC test</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Fat % *"><input name="fatPct" type="number" step="0.01" className="input" required /></Field>
                <Field label="SNF % *"><input name="snfPct" type="number" step="0.01" className="input" required /></Field>
                <Field label="Acidity %"><input name="acidityPct" type="number" step="0.001" className="input" /></Field>
                <Field label="COB test"><select name="cobTest" className="input" defaultValue=""><option value="">–</option><option>PASS</option><option>FAIL</option></select></Field>
                <Field label="Alcohol test"><select name="alcoholTest" className="input" defaultValue=""><option value="">–</option><option>PASS</option><option>FAIL</option></select></Field>
                <Field label="Adulteration"><select name="adulteration" className="input" defaultValue=""><option value="">–</option><option>NONE</option><option>DETECTED</option></select></Field>
              </div>
              <Field label="Remarks"><input name="qcRemarks" className="input" /></Field>
              <Field label="Reject reason (required if rejecting)"><input name="rejectReason" className="input" /></Field>
              <div className="flex gap-2">
                <button name="decision" value="ACCEPT" className="btn-success">Accept</button>
                <button name="decision" value="REJECT" className="btn-danger">Reject</button>
              </div>
            </form>
          )}
          {(rec.status === 'ACCEPTED' || rec.status === 'UNLOADED') && (
            <div className="card card-pad border-emerald-200 bg-emerald-50 text-sm text-emerald-900">
              <b>Accepted.</b> {num(rec.supplierQtyL)} L added to the <Link href={`/silos?date=${rec.date.toISOString().slice(0, 10)}`} className="font-medium underline">milk tank</Link>.
            </div>
          )}
          {rec.status === 'REJECTED' && <div className="card card-pad border-red-200 bg-red-50 text-sm text-red-800"><b>Rejected:</b> {rec.rejectReason}</div>}
          {rec.status === 'CANCELLED' && <div className="card card-pad bg-slate-50 text-sm"><b>Cancelled:</b> {rec.cancelReason}</div>}
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
              <p className="text-xs text-slate-500">For wrong entries only. The record stays visible and its milk is taken out of the milk tank.</p>
              <input name="reason" placeholder="Reason *" className="input" required />
              <button className="btn-danger btn-sm">Cancel entry</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
