'use server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireEdit } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { run, UserError, reqNum, optNum, reqStr, optStr, str } from '@/lib/forms';
import { toDateOnly, bsCompact, todayISO } from '@/lib/dates';
import { getSnfFormula } from '@/lib/tolerance';
import { calcSnf } from '@/lib/snf';

async function nextReceiptNo(dateIso) {
  const prefix = `R${bsCompact(dateIso)}-`;
  const last = await prisma.milkReceipt.findFirst({ where: { receiptNo: { startsWith: prefix } }, orderBy: { receiptNo: 'desc' } });
  const n = last ? parseInt(last.receiptNo.slice(prefix.length), 10) + 1 : 1;
  return prefix + String(n).padStart(2, '0');
}

/** Arrival + QC test in one entry: accepted milk goes straight into the milk tank. */
export async function createReceipt(formData) {
  await run('/receiving/new', async () => {
    const user = await requireEdit('receiving');
    const decision = str(formData, 'decision');
    if (!['ACCEPT', 'REJECT'].includes(decision)) throw new UserError('Choose Accept or Reject');
    const date = str(formData, 'date') || todayISO();
    if (date > todayISO()) throw new UserError('Date cannot be in the future');
    const supplierId = reqNum(formData, 'supplierId', 'Supplier');
    const vehicleNo = reqStr(formData, 'vehicleNo', 'Vehicle number').toUpperCase();
    const tanker = await prisma.tanker.findFirst({ where: { number: { equals: vehicleNo, mode: 'insensitive' } } });
    const supplierQtyL = reqNum(formData, 'supplierQtyL', 'Milk quantity');
    if (supplierQtyL <= 0 || supplierQtyL > 50000) throw new UserError('Milk quantity looks wrong');
    const fatPct = reqNum(formData, 'fatPct', 'Fat %');
    const lactoReading = reqNum(formData, 'lactoReading', 'Lacto reading');
    if (fatPct < 0 || fatPct > 15) throw new UserError('Fat % looks wrong');
    if (lactoReading < 15 || lactoReading > 40) throw new UserError('Lacto reading (CLR) should be between 15 and 40');
    const snfPct = calcSnf(lactoReading, fatPct, await getSnfFormula());
    const adulteration = str(formData, 'adulteration') || 'NONE';
    const qcRemarks = optStr(formData, 'qcRemarks');
    if (decision === 'REJECT' && !qcRemarks) throw new UserError('Write the reason for rejection in Remarks');
    if (decision === 'ACCEPT' && adulteration !== 'NONE' && !qcRemarks) throw new UserError(`Adulteration found (${adulteration}). Write a remark to accept this tanker, or reject it.`);
    const accept = decision === 'ACCEPT';
    let rec;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        rec = await prisma.milkReceipt.create({
          data: {
            receiptNo: await nextReceiptNo(date),
            date: toDateOnly(date),
            supplierId,
            tankerId: tanker?.id ?? null,
            vehicleNo,
            supplierQtyL,
            temperatureC: optNum(formData, 'temperatureC'),
            fatPct, lactoReading, snfPct, adulteration, qcRemarks,
            rejectReason: accept ? null : qcRemarks,
            status: accept ? 'ACCEPTED' : 'REJECTED',
            qcById: user.id,
            qcAt: new Date(),
            createdById: user.id,
          },
        });
        break;
      } catch (e) {
        if (e?.code !== 'P2002' || attempt === 2) throw e;
      }
    }
    await audit({ userId: user.id, action: 'QC', entity: 'MilkReceipt', entityId: rec.id, after: rec });
    revalidatePath('/receiving');
    const msg = accept ? `${rec.receiptNo} accepted: ${supplierQtyL} L, fat ${fatPct}, SNF ${snfPct}` : `${rec.receiptNo} rejected`;
    return `/receiving/new?ok=${encodeURIComponent(msg)}`;
  });
}

export async function saveQc(id, formData) {
  const back = `/receiving/${id}`;
  await run(back, async () => {
    const user = await requireEdit('receiving');
    const rec = await prisma.milkReceipt.findUnique({ where: { id } });
    if (!rec || rec.status !== 'PENDING_QC') throw new UserError('QC already recorded for this tanker');
    const decision = str(formData, 'decision');
    if (!['ACCEPT', 'REJECT'].includes(decision)) throw new UserError('Choose Accept or Reject');
    const fatPct = reqNum(formData, 'fatPct', 'Fat %');
    const snfPct = reqNum(formData, 'snfPct', 'SNF %');
    if (fatPct < 0 || fatPct > 15) throw new UserError('Fat % looks wrong');
    if (snfPct < 0 || snfPct > 15) throw new UserError('SNF % looks wrong');
    const rejectReason = optStr(formData, 'rejectReason');
    if (decision === 'REJECT' && !rejectReason) throw new UserError('Give the reason for rejection');
    const data = {
      fatPct, snfPct,
      acidityPct: optNum(formData, 'acidityPct'),
      cobTest: optStr(formData, 'cobTest'),
      alcoholTest: optStr(formData, 'alcoholTest'),
      adulteration: optStr(formData, 'adulteration'),
      qcRemarks: optStr(formData, 'qcRemarks'),
      rejectReason: decision === 'REJECT' ? rejectReason : null,
      status: decision === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED',
      qcById: user.id,
      qcAt: new Date(),
    };
    const after = await prisma.milkReceipt.update({ where: { id }, data });
    await audit({ userId: user.id, action: 'QC', entity: 'MilkReceipt', entityId: id, after: { ...data, receiptNo: after.receiptNo } });
    revalidatePath('/receiving');
    return `${back}?ok=${decision === 'ACCEPT' ? 'QC passed. Milk added to the milk tank.' : 'Tanker rejected.'}`;
  });
}

// Cancelling takes the tanker's milk out of the milk tank (the tank is worked out from accepted receipts).
export async function cancelReceipt(id, formData) {
  const back = `/receiving/${id}`;
  await run(back, async () => {
    const user = await requireEdit('approve');
    const reason = reqStr(formData, 'reason', 'Reason');
    await prisma.$transaction(async (tx) => {
      const rec = await tx.milkReceipt.findUnique({ where: { id } });
      if (!rec || rec.status === 'CANCELLED') throw new UserError('Already cancelled');
      await tx.milkReceipt.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: reason } });
      await audit({ userId: user.id, action: 'CANCEL', entity: 'MilkReceipt', entityId: id, before: { status: rec.status }, reason }, tx);
    });
    revalidatePath('/receiving');
    revalidatePath('/silos');
    return `${back}?ok=Receipt cancelled`;
  });
}
