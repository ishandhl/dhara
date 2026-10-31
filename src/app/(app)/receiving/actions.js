'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireEdit } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { run, UserError, reqNum, optNum, reqStr, optStr, str, entryDate, lock } from '@/lib/forms';
import { toDateOnly, bsCompact } from '@/lib/dates';
import { getSnfFormula } from '@/lib/tolerance';
import { calcSnf } from '@/lib/snf';
import { tankStock } from '@/lib/milkTank';
import { nextNo } from '@/lib/numbering';

const TEST = ['PASS', 'FAIL'];
const plate = (v) => v.toUpperCase().replace(/[\s-]+/g, ''); // "Ba 1 Kha 1234" = "BA1KHA1234"

/** QC readings shared by a new entry and a correction. */
async function readQc(formData) {
  const supplierQtyL = reqNum(formData, 'supplierQtyL', 'Milk quantity');
  if (supplierQtyL <= 0 || supplierQtyL > 50000) throw new UserError('Milk quantity looks wrong');
  const fatPct = reqNum(formData, 'fatPct', 'Fat %');
  const lactoReading = reqNum(formData, 'lactoReading', 'Lacto reading');
  if (fatPct <= 0 || fatPct > 15) throw new UserError('Fat % looks wrong');
  if (lactoReading < 15 || lactoReading > 40) throw new UserError('Lacto reading (CLR) should be between 15 and 40');
  const temperatureC = optNum(formData, 'temperatureC', 'Temperature');
  if (temperatureC !== null && (temperatureC < -5 || temperatureC > 50)) throw new UserError('Temperature looks wrong');
  const acidityPct = optNum(formData, 'acidityPct', 'Acidity %');
  if (acidityPct !== null && (acidityPct < 0 || acidityPct > 1)) throw new UserError('Acidity % looks wrong (normal milk is about 0.13–0.15)');
  const cobTest = TEST.includes(str(formData, 'cobTest')) ? str(formData, 'cobTest') : null;
  const alcoholTest = TEST.includes(str(formData, 'alcoholTest')) ? str(formData, 'alcoholTest') : null;
  return { supplierQtyL, fatPct, lactoReading, snfPct: calcSnf(lactoReading, fatPct, await getSnfFormula()), temperatureC, acidityPct, cobTest, alcoholTest };
}

/**
 * Arrival + QC test in one entry: accepted milk goes straight into the milk tank.
 * Called from the QC form directly: a mistake comes back as { error } so the clerk's typing stays on screen
 * (a redirect with ?error= would rebuild the page and wipe ten fields typed at the gate).
 */
export async function createReceipt(formData) {
  let to;
  try {
    to = await saveReceipt(formData);
  } catch (e) {
    if (e?.digest?.startsWith?.('NEXT_REDIRECT')) throw e;
    if (e instanceof UserError) return { error: e.message };
    console.error(e);
    return { error: 'Could not save. Check your connection and press Accept again — a repeated tanker is caught, not saved twice.' };
  }
  redirect(to);
}

async function saveReceipt(formData) {
  const user = await requireEdit('receiving');
  const decision = str(formData, 'decision');
  if (!['ACCEPT', 'REJECT'].includes(decision)) throw new UserError('Choose Accept or Reject');
  const date = entryDate(formData, user);
  const supplierId = reqNum(formData, 'supplierId', 'Supplier');
  const vehicleNo = reqStr(formData, 'vehicleNo', 'Vehicle number').toUpperCase().replace(/\s+/g, ' ');
  const qc = await readQc(formData);
  const tanker = (await prisma.tanker.findMany({ where: { active: true } })).find((t) => plate(t.number) === plate(vehicleNo));
  if (tanker?.capacityL && qc.supplierQtyL > tanker.capacityL * 1.05) throw new UserError(`${tanker.number} holds ${tanker.capacityL} L — ${qc.supplierQtyL} L cannot be right. Check the quantity.`);
  const adulteration = str(formData, 'adulteration') || 'NONE';
  const qcRemarks = optStr(formData, 'qcRemarks');
  const failed = [adulteration !== 'NONE' && `adulteration (${adulteration})`, qc.cobTest === 'FAIL' && 'COB test failed', qc.alcoholTest === 'FAIL' && 'alcohol test failed'].filter(Boolean);
  if (decision === 'REJECT' && !qcRemarks) throw new UserError('Write the reason for rejection in Remarks');
  if (decision === 'ACCEPT' && failed.length && !qcRemarks) throw new UserError(`${failed.join(', ')}. Write a remark to accept this tanker, or reject it.`);
  const accept = decision === 'ACCEPT';
  let rec;
  let duplicate = null;
  await prisma.$transaction(async (tx) => {
    await lock(tx, 'receipt');
    // Same vehicle, same litres, same day within 10 minutes = the same tanker submitted twice (double tap, refresh).
    duplicate = await tx.milkReceipt.findFirst({ where: { date: toDateOnly(date), vehicleNo, supplierQtyL: qc.supplierQtyL, status: { not: 'CANCELLED' }, createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } } });
    if (duplicate) return;
    rec = await tx.milkReceipt.create({
      data: {
        receiptNo: await nextNo(tx, 'milkReceipt', 'receiptNo', `R${bsCompact(date)}-`),
        date: toDateOnly(date), supplierId, tankerId: tanker?.id ?? null, vehicleNo,
        ...qc, adulteration, qcRemarks,
        rejectReason: accept ? null : qcRemarks,
        status: accept ? 'ACCEPTED' : 'REJECTED',
        qcById: user.id, qcAt: new Date(), createdById: user.id,
      },
    });
    await audit({ userId: user.id, action: 'QC', entity: 'MilkReceipt', entityId: rec.id, after: rec }, tx);
  });
  if (duplicate) return `/receiving/new?ok=${encodeURIComponent(`Already saved a moment ago as ${duplicate.receiptNo} — not entered twice.`)}`;
  revalidatePath('/receiving');
  revalidatePath('/silos');
  const msg = accept ? `${rec.receiptNo} accepted: ${qc.supplierQtyL} L, fat ${qc.fatPct}, SNF ${qc.snfPct} — ${date}` : `${rec.receiptNo} rejected — ${date}`;
  return `/receiving/new?ok=${encodeURIComponent(msg)}`;
}

/** Manager: fix a typo (litres, fat, CLR …) in place. Keeps the receipt number and arrival time; the change is in the audit log. */
export async function correctReceipt(id, formData) {
  const back = `/receiving/${id}`;
  await run(back, async () => {
    const user = await requireEdit('approve');
    const reason = reqStr(formData, 'reason', 'Reason');
    const qc = await readQc(formData);
    await prisma.$transaction(async (tx) => {
      await lock(tx, 'receipt', id);
      await lock(tx, 'tank');
      const rec = await tx.milkReceipt.findUnique({ where: { id } });
      if (!rec || !['ACCEPTED', 'UNLOADED', 'REJECTED'].includes(rec.status)) throw new UserError('Only an accepted or rejected entry can be corrected');
      const less = ['ACCEPTED', 'UNLOADED'].includes(rec.status) ? rec.supplierQtyL - qc.supplierQtyL : 0;
      if (less > 0) {
        const inTank = await tankStock(undefined, tx);
        if (inTank - less < -0.5) throw new UserError(`Only ${Math.round(inTank)} L left in the tank; the rest of this milk is already in batches. Correct the batch first.`);
      }
      const before = Object.fromEntries(Object.keys(qc).map((k) => [k, rec[k]]));
      await tx.milkReceipt.update({ where: { id }, data: qc });
      await audit({ userId: user.id, action: 'CORRECT', entity: 'MilkReceipt', entityId: id, before, after: qc, reason }, tx);
    });
    revalidatePath('/receiving');
    revalidatePath('/silos');
    return `${back}?ok=${encodeURIComponent('Entry corrected')}`;
  });
}

// Cancelling takes the tanker's milk out of the milk tank (the tank is worked out from accepted receipts).
export async function cancelReceipt(id, formData) {
  const back = `/receiving/${id}`;
  await run(back, async () => {
    const user = await requireEdit('approve');
    const reason = reqStr(formData, 'reason', 'Reason');
    await prisma.$transaction(async (tx) => {
      await lock(tx, 'receipt', id);
      await lock(tx, 'tank');
      const rec = await tx.milkReceipt.findUnique({ where: { id } });
      if (!rec || rec.status === 'CANCELLED') throw new UserError('Already cancelled');
      if (['ACCEPTED', 'UNLOADED'].includes(rec.status)) {
        const inTank = await tankStock(undefined, tx);
        if (inTank - rec.supplierQtyL < -0.5) throw new UserError(`Only ${Math.round(inTank)} L left in the tank; this tanker's milk is already in batches. If the litres were wrong, correct the entry instead.`);
      }
      await tx.milkReceipt.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: reason } });
      await audit({ userId: user.id, action: 'CANCEL', entity: 'MilkReceipt', entityId: id, before: { status: rec.status }, reason }, tx);
    });
    revalidatePath('/receiving');
    revalidatePath('/silos');
    return `${back}?ok=Receipt cancelled`;
  });
}
