'use server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireEdit } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { run, UserError, reqNum, optNum, reqStr, optStr, str } from '@/lib/forms';
import { toDateOnly, bsCompact, todayISO } from '@/lib/dates';
import { dipToLitres } from '@/lib/dip';
import { getDensity, getSnfFormula } from '@/lib/tolerance';
import { calcSnf } from '@/lib/snf';
import { siloStock } from '@/lib/stock';
import { round } from '@/lib/format';

async function nextReceiptNo(dateIso) {
  const prefix = `R${bsCompact(dateIso)}-`;
  const last = await prisma.milkReceipt.findFirst({ where: { receiptNo: { startsWith: prefix } }, orderBy: { receiptNo: 'desc' } });
  const n = last ? parseInt(last.receiptNo.slice(prefix.length), 10) + 1 : 1;
  return prefix + String(n).padStart(2, '0');
}

/** Arrival + QC test in one entry: accepted tankers go straight to unloading. */
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
    return `${back}?ok=${decision === 'ACCEPT' ? 'QC passed. Now unload into a silo.' : 'Tanker rejected.'}`;
  });
}

export async function unloadReceipt(id, formData) {
  const back = `/receiving/${id}`;
  await run(back, async () => {
    const user = await requireEdit('receiving');
    const density = await getDensity();
    await prisma.$transaction(async (tx) => {
      const rec = await tx.milkReceipt.findUnique({ where: { id } });
      if (!rec || rec.status !== 'ACCEPTED') throw new UserError('This tanker is not waiting to be unloaded');
      const siloId = reqNum(formData, 'siloId', 'Silo');
      const silo = await tx.silo.findUnique({ where: { id: siloId }, include: { dipPoints: true } });
      if (!silo || !silo.active) throw new UserError('Pick an active silo');
      const mode = str(formData, 'mode');
      let dipBeforeCm = null, dipAfterCm = null, litresBefore = null, litresAfter = null, dipLitres, factor;
      if (mode === 'dip') {
        if (silo.dipPoints.length < 2) throw new UserError(`${silo.name} has no dip chart yet. Enter litres directly or add the chart in Masters.`);
        dipBeforeCm = reqNum(formData, 'dipBeforeCm', 'Dip before');
        dipAfterCm = reqNum(formData, 'dipAfterCm', 'Dip after');
        if (dipAfterCm <= dipBeforeCm) throw new UserError('Dip after must be higher than dip before');
        litresBefore = dipToLitres(silo.dipPoints, dipBeforeCm);
        litresAfter = dipToLitres(silo.dipPoints, dipAfterCm);
        dipLitres = litresAfter - litresBefore;
        factor = silo.correctionFactor;
      } else {
        dipLitres = reqNum(formData, 'directLitres', 'Litres received');
        factor = 1;
      }
      if (dipLitres <= 0) throw new UserError('Received quantity must be above 0');
      const ourQtyL = round(dipLitres * factor, 1);
      const current = await siloStock(siloId, tx);
      if (current.litres + ourQtyL > silo.capacityL * 1.02) throw new UserError(`${silo.name} would hold ${Math.round(current.litres + ourQtyL)} L, above its ${silo.capacityL} L capacity`);
      const kgFat = round(ourQtyL * density * (rec.fatPct / 100), 2);
      const kgSnf = round(ourQtyL * density * (rec.snfPct / 100), 2);
      const differenceL = round(ourQtyL - rec.supplierQtyL, 1);
      const differencePct = round((differenceL / rec.supplierQtyL) * 100, 2);
      const isoDate = rec.date.toISOString().slice(0, 10);
      const data = {
        siloId, dipBeforeCm, dipAfterCm,
        litresBefore: litresBefore === null ? null : round(litresBefore * factor, 1),
        litresAfter: litresAfter === null ? null : round(litresAfter * factor, 1),
        dipLitres: round(dipLitres, 1), factor, ourQtyL, kgFat, kgSnf, differenceL, differencePct,
        status: 'UNLOADED', unloadedById: user.id, unloadedAt: new Date(),
      };
      await tx.milkReceipt.update({ where: { id }, data });
      await tx.siloMovement.create({
        data: { siloId, date: rec.date, type: 'RECEIPT', litres: ourQtyL, kgFat, kgSnf, refType: 'MilkReceipt', refId: id, note: `${rec.receiptNo} ${rec.vehicleNo}`, createdById: user.id },
      });
      // The "before" dip doubles as a silo check reading against the system stock.
      if (litresBefore !== null) {
        const l = round(litresBefore * factor, 1);
        await tx.siloDip.create({ data: { siloId, date: toDateOnly(isoDate), kind: 'CHECK', dipCm: dipBeforeCm, litres: l, systemLitres: round(current.litres, 1), varianceL: round(l - current.litres, 1), note: `Before unloading ${rec.receiptNo}`, createdById: user.id } });
      }
      await audit({ userId: user.id, action: 'UNLOAD', entity: 'MilkReceipt', entityId: id, after: { ...data, receiptNo: rec.receiptNo } }, tx);
    });
    revalidatePath('/receiving');
    revalidatePath('/silos');
    return `${back}?ok=Unloaded into silo`;
  });
}

export async function cancelReceipt(id, formData) {
  const back = `/receiving/${id}`;
  await run(back, async () => {
    const user = await requireEdit('approve');
    const reason = reqStr(formData, 'reason', 'Reason');
    await prisma.$transaction(async (tx) => {
      const rec = await tx.milkReceipt.findUnique({ where: { id } });
      if (!rec || rec.status === 'CANCELLED') throw new UserError('Already cancelled');
      if (rec.status === 'UNLOADED') {
        const stock = await siloStock(rec.siloId, tx);
        if (stock.litres < rec.ourQtyL - 0.5) throw new UserError('That milk has already been used from the silo; correct the silo with an adjustment instead');
        await tx.siloMovement.create({ data: { siloId: rec.siloId, date: rec.date, type: 'REVERSAL', litres: -rec.ourQtyL, kgFat: -rec.kgFat, kgSnf: -rec.kgSnf, refType: 'MilkReceipt', refId: id, note: `Cancel ${rec.receiptNo}: ${reason}`, createdById: user.id } });
      }
      await tx.milkReceipt.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: reason } });
      await audit({ userId: user.id, action: 'CANCEL', entity: 'MilkReceipt', entityId: id, before: { status: rec.status }, reason }, tx);
    });
    revalidatePath('/receiving');
    revalidatePath('/silos');
    return `${back}?ok=Receipt cancelled`;
  });
}
