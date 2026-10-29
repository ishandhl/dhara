'use server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireEdit } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { run, UserError, reqNum, optNum, reqStr, optStr, str } from '@/lib/forms';
import { toDateOnly, todayISO, bsCompact, addDays, isoOf } from '@/lib/dates';
import { getDensity, getTolerances, flag } from '@/lib/tolerance';
import { batchSummary } from '@/lib/batch';
import { round } from '@/lib/format';

const path = (id) => `/production/${id}`;
const LOOSE_UNITS = ['litre', 'kg'];

async function openBatch(tx, id) {
  const b = await tx.batch.findUnique({ where: { id } });
  if (!b) throw new UserError('Batch not found');
  if (b.status !== 'OPEN') throw new UserError(`Batch is ${b.status.toLowerCase()} and cannot be changed`);
  return b;
}

export async function createBatch(formData) {
  await run('/production', async () => {
    const user = await requireEdit('production');
    const date = str(formData, 'date') || todayISO();
    if (date > todayISO()) throw new UserError('Date cannot be in the future');
    const prefix = `B${bsCompact(date)}-`;
    let b;
    for (let attempt = 0; attempt < 3; attempt++) {
      const last = await prisma.batch.findFirst({ where: { batchNo: { startsWith: prefix } }, orderBy: { batchNo: 'desc' } });
      const n = last ? parseInt(last.batchNo.slice(prefix.length), 10) + 1 : 1;
      try {
        b = await prisma.batch.create({ data: { batchNo: prefix + String(n).padStart(2, '0'), date: toDateOnly(date), note: optStr(formData, 'note'), createdById: user.id } });
        break;
      } catch (e) {
        if (e?.code !== 'P2002' || attempt === 2) throw e;
      }
    }
    await audit({ userId: user.id, action: 'CREATE', entity: 'Batch', entityId: b.id, after: b });
    revalidatePath('/production');
    return `${path(b.id)}?ok=${encodeURIComponent(`Batch ${b.batchNo} opened. Enter the milk allocated first.`)}`;
  });
}

export async function updateHeader(id, formData) {
  await run(path(id), async () => {
    const user = await requireEdit('production');
    await openBatch(prisma, id);
    const data = { fatPct: optNum(formData, 'fatPct'), snfPct: optNum(formData, 'snfPct'), note: optStr(formData, 'note') };
    await prisma.batch.update({ where: { id }, data });
    await audit({ userId: user.id, action: 'UPDATE', entity: 'Batch', entityId: id, after: data });
  });
}

/** Milk allocated to the batch: litres, with fat / SNF % for the fat balance. No silo is tracked. */
export async function addInput(id, formData) {
  await run(path(id), async () => {
    const user = await requireEdit('production');
    const litres = reqNum(formData, 'litres', 'Litres');
    if (litres <= 0) throw new UserError('Litres must be above 0');
    const fatPct = optNum(formData, 'fatPct');
    const snfPct = optNum(formData, 'snfPct');
    if (fatPct !== null && (fatPct < 0 || fatPct > 15)) throw new UserError('Fat % looks wrong');
    if (snfPct !== null && (snfPct < 0 || snfPct > 15)) throw new UserError('SNF % looks wrong');
    const b = await openBatch(prisma, id);
    const input = await prisma.batchInput.create({ data: { batchId: id, litres, fatPct, snfPct } });
    await audit({ userId: user.id, action: 'CREATE', entity: 'BatchInput', entityId: input.id, after: { batchNo: b.batchNo, litres, fatPct, snfPct } });
  });
}

export async function removeInput(id, inputId) {
  await run(path(id), async () => {
    const user = await requireEdit('production');
    await prisma.$transaction(async (tx) => {
      await openBatch(tx, id);
      const input = await tx.batchInput.findUnique({ where: { id: inputId } });
      if (!input || input.batchId !== id) throw new UserError('Line not found');
      await tx.batchInput.delete({ where: { id: inputId } });
      await audit({ userId: user.id, action: 'DELETE', entity: 'BatchInput', entityId: inputId, before: input }, tx);
    });
    revalidatePath('/silos');
  });
}

export async function addOutput(id, formData) {
  await run(path(id), async () => {
    const user = await requireEdit('production');
    const b = await openBatch(prisma, id);
    const productId = reqNum(formData, 'productId', 'Product');
    const units = reqNum(formData, 'units', 'Units');
    const p = await prisma.product.findUnique({ where: { id: productId } });
    if (units <= 0) throw new UserError('Quantity must be above 0');
    if (!LOOSE_UNITS.includes(p.unitName) && !Number.isInteger(units)) throw new UserError(`${p.name} is counted in ${p.unitName}s — enter a whole number`);
    const row = await prisma.batchOutput.create({ data: { batchId: id, productId, units, litres: round(units * p.litresPerUnit, 3), expiryDate: toDateOnly(addDays(isoOf(b.date), p.shelfLifeDays)) } });
    await audit({ userId: user.id, action: 'CREATE', entity: 'BatchOutput', entityId: row.id, after: { batchNo: b.batchNo, product: p.code, units } });
  });
}

export async function addLoss(id, formData) {
  await run(path(id), async () => {
    const user = await requireEdit('production');
    const b = await openBatch(prisma, id);
    const litres = reqNum(formData, 'litres', 'Litres');
    if (litres <= 0) throw new UserError('Litres must be above 0');
    const row = await prisma.batchLoss.create({ data: { batchId: id, reasonId: reqNum(formData, 'reasonId', 'Reason'), litres, note: optStr(formData, 'note') } });
    await audit({ userId: user.id, action: 'CREATE', entity: 'BatchLoss', entityId: row.id, after: { batchNo: b.batchNo, ...row } });
  });
}

export async function addByProduct(id, formData) {
  await run(path(id), async () => {
    const user = await requireEdit('production');
    const b = await openBatch(prisma, id);
    const litres = reqNum(formData, 'litres', 'Litres');
    if (litres <= 0) throw new UserError('Litres must be above 0');
    const row = await prisma.batchByProduct.create({ data: { batchId: id, name: reqStr(formData, 'name', 'Name'), litres } });
    await audit({ userId: user.id, action: 'CREATE', entity: 'BatchByProduct', entityId: row.id, after: { batchNo: b.batchNo, ...row } });
  });
}

export async function addPackaging(id, formData) {
  await run(path(id), async () => {
    const user = await requireEdit('production');
    const b = await openBatch(prisma, id);
    const qtyUsed = reqNum(formData, 'qtyUsed', 'Quantity used');
    if (qtyUsed <= 0) throw new UserError('Quantity must be above 0');
    const row = await prisma.batchPackaging.create({ data: { batchId: id, packagingItemId: reqNum(formData, 'packagingItemId', 'Item'), qtyUsed } });
    await audit({ userId: user.id, action: 'CREATE', entity: 'BatchPackaging', entityId: row.id, after: { batchNo: b.batchNo, ...row } });
  });
}

export async function addIngredient(id, formData) {
  await run(path(id), async () => {
    const user = await requireEdit('production');
    const b = await openBatch(prisma, id);
    const qty = reqNum(formData, 'qty', 'Quantity');
    if (qty <= 0) throw new UserError('Quantity must be above 0');
    const item = await prisma.packagingItem.findUnique({ where: { id: reqNum(formData, 'packagingItemId', 'Ingredient') } });
    if (!item) throw new UserError('Ingredient not found');
    const row = await prisma.batchIngredient.create({ data: { batchId: id, packagingItemId: item.id, qty } });
    await audit({ userId: user.id, action: 'CREATE', entity: 'BatchIngredient', entityId: row.id, after: { batchNo: b.batchNo, item: item.name, qty } });
  });
}

const LINE_MODELS = { output: 'batchOutput', loss: 'batchLoss', byproduct: 'batchByProduct', packaging: 'batchPackaging', ingredient: 'batchIngredient' };

export async function removeLine(id, kind, lineId) {
  await run(path(id), async () => {
    const user = await requireEdit('production');
    await openBatch(prisma, id);
    const model = LINE_MODELS[kind];
    if (!model) throw new UserError('Unknown line');
    const before = await prisma[model].findUnique({ where: { id: lineId } });
    if (!before || before.batchId !== id) throw new UserError('Line not found');
    await prisma[model].delete({ where: { id: lineId } });
    await audit({ userId: user.id, action: 'DELETE', entity: model, entityId: lineId, before });
  });
}

export async function closeBatch(id, formData) {
  await run(path(id), async () => {
    const user = await requireEdit('production');
    const density = await getDensity();
    const tol = (await getTolerances()).PRODUCTION_LOSS;
    const closingNote = optStr(formData, 'closingNote');
    await prisma.$transaction(async (tx) => {
      await openBatch(tx, id);
      const b = await tx.batch.findUnique({ where: { id }, include: { inputs: true, outputs: true, losses: true, byProducts: true, packaging: true, ingredients: true } });
      if (!b.inputs.length) throw new UserError('Enter the milk allocated to this batch before closing');
      if (!b.outputs.length) throw new UserError('Enter at least one product output before closing');
      const s = batchSummary(b, density);
      if (s.unexplainedL < -0.5 && Math.abs(s.unexplainedPct) > tol.amberPct) throw new UserError(`Output + losses are ${Math.abs(Math.round(s.unexplainedL))} L MORE than milk issued. Check the entries.`);
      const f = flag(s.unexplainedPct, tol);
      if (f === 'red' && !closingNote) throw new UserError(`Loss is ${s.unexplainedPct}% (above ${tol.amberPct}%). Write a closing note explaining it.`);
      for (const o of b.outputs) {
        await tx.stockLedger.create({ data: { date: b.date, productId: o.productId, batchNo: b.batchNo, expiryDate: o.expiryDate, type: 'PRODUCTION_IN', qtyUnits: o.units, refType: 'BatchOutput', refId: o.id, createdById: user.id } });
      }
      for (const p of b.packaging) {
        await tx.packagingLedger.create({ data: { date: b.date, packagingItemId: p.packagingItemId, type: 'ISSUE', qty: -p.qtyUsed, refType: 'BatchPackaging', refId: p.id, note: `Batch ${b.batchNo}`, createdById: user.id } });
      }
      for (const g of b.ingredients) {
        await tx.packagingLedger.create({ data: { date: b.date, packagingItemId: g.packagingItemId, type: 'ISSUE', qty: -g.qty, party: 'Production', refType: 'BatchIngredient', refId: g.id, note: `Added to batch ${b.batchNo}`, createdById: user.id } });
      }
      await tx.batch.update({ where: { id }, data: { status: 'CLOSED', closedById: user.id, closedAt: new Date(), note: closingNote ? [b.note, `Closing: ${closingNote}`].filter(Boolean).join(' · ') : b.note } });
      await audit({ userId: user.id, action: 'CLOSE', entity: 'Batch', entityId: id, after: { batchNo: b.batchNo, ...s, flag: f }, reason: closingNote }, tx);
    });
    revalidatePath('/production');
    revalidatePath('/store');
    revalidatePath('/general-store');
    return `${path(id)}?ok=${encodeURIComponent('Batch closed and stock sent to the cold room')}`;
  });
}

export async function cancelBatch(id, formData) {
  await run(path(id), async () => {
    const user = await requireEdit('approve');
    const reason = reqStr(formData, 'reason', 'Reason');
    await prisma.$transaction(async (tx) => {
      await openBatch(tx, id);
      await tx.batch.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: reason } });
      await audit({ userId: user.id, action: 'CANCEL', entity: 'Batch', entityId: id, reason }, tx);
    });
    revalidatePath('/production');
    revalidatePath('/silos');
    return `${path(id)}?ok=Batch cancelled`;
  });
}
