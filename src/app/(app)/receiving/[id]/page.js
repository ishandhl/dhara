import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireView } from '@/lib/auth';
import { canEdit } from '@/lib/roles';
import { fmtDate, fmtDateTime } from '@/lib/dates';
import { num, pct } from '@/lib/format';
import { getTolerances, flag } from '@/lib/tolerance';
import { siloStocks } from '@/lib/stock';
import { saveQc, unloadReceipt, cancelReceipt } from '../actions';
import UnloadForm from '@/components/UnloadForm';
import { Flash, PageHeader, StatusBadge, FlagBadge, Field } from '@/components/ui';

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
  const userIds = [rec.createdById, rec.qcById, rec.unloadedById].filter(Boolean);
  const users = Object.fromEntries((await prisma.user.findMany({ where: { id: { in: userIds } } })).map((u) => [u.id, u.name]));
  const silo = rec.siloId ? await prisma.silo.findUnique({ where: { id: rec.siloId } }) : null;
  const tol = (await getTolerances()).TANKER_VS_SUPPLIER;
  const canEnter = canEdit(user.role, 'receiving');
  const silos = rec.status === 'ACCEPTED' ? await prisma.silo.findMany({ where: { active: true }, orderBy: { name: 'asc' }, include: { dipPoints: { select: { cm: true, litres: true } } } }) : [];
  const stocks = rec.status === 'ACCEPTED' ? await siloStocks() : {};

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
          {rec.status === 'ACCEPTED' && canEnter && (
            <div className="card card-pad">
              <h2 className="h2 mb-3">Unload into silo <span className="text-sm font-normal text-slate-500">(optional — when the milk goes into a silo)</span></h2>
              <UnloadForm action={unloadReceipt.bind(null, id)} silos={silos} stocks={stocks} supplierQtyL={rec.supplierQtyL} />
            </div>
          )}
          {rec.status === 'UNLOADED' && (
            <div className="card card-pad">
              <h2 className="h2 mb-3">Result</h2>
              <div className="grid gap-3 sm:grid-cols-4">
                <div><div className="text-xs text-slate-500">Our quantity</div><div className="text-2xl font-semibold">{num(rec.ourQtyL)} L</div></div>
                <div><div className="text-xs text-slate-500">Supplier quantity</div><div className="text-2xl font-semibold">{num(rec.supplierQtyL)} L</div></div>
                <div><div className="text-xs text-slate-500">Difference</div><div className="text-2xl font-semibold"><FlagBadge flag={flag(rec.differencePct, tol)}>{`${rec.differenceL > 0 ? '+' : ''}${num(rec.differenceL)} L`}</FlagBadge></div><div className="text-xs text-slate-500">{pct(rec.differencePct)}</div></div>
                <div><div className="text-xs text-slate-500">kg fat / kg SNF</div><div className="text-2xl font-semibold">{num(rec.kgFat, 1)} / {num(rec.kgSnf, 1)}</div></div>
              </div>
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
          {rec.unloadedAt && (
            <div className="card card-pad">
              <h2 className="h2 mb-2">Unloading</h2>
              <Row k="Silo" v={silo?.name} />
              {rec.dipBeforeCm !== null && <Row k="Dip before → after" v={`${rec.dipBeforeCm} → ${rec.dipAfterCm} cm`} />}
              {rec.dipBeforeCm !== null && <Row k="Litres before → after" v={`${num(rec.litresBefore)} → ${num(rec.litresAfter)}`} />}
              <Row k="Chart litres × factor" v={`${num(rec.dipLitres, 1)} × ${rec.factor}`} />
              <Row k="Unloaded by" v={`${users[rec.unloadedById]} · ${fmtDateTime(rec.unloadedAt)}`} />
            </div>
          )}
          {canEdit(user.role, 'approve') && rec.status !== 'CANCELLED' && (
            <form action={cancelReceipt.bind(null, id)} className="card card-pad space-y-2">
              <h2 className="h2">Cancel this entry</h2>
              <p className="text-xs text-slate-500">For wrong entries only. The record stays visible and any silo stock is reversed.</p>
              <input name="reason" placeholder="Reason *" className="input" required />
              <button className="btn-danger btn-sm">Cancel entry</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
