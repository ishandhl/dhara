'use server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireEdit } from '@/lib/auth';
import { canEdit } from '@/lib/roles';
import { audit } from '@/lib/audit';
import { run, UserError, reqNum, optNum, reqStr, optStr, entryDate, lock } from '@/lib/forms';
import { toDateOnly, todayISO, bsCompact, addDays, isoOf } from '@/lib/dates';
import { getDensity, getTolerances, flag } from '@/lib/tolerance';
import { batchSummary, expectedPackaging } from '@/lib/batch';
import { round, qty } from '@/lib/format';
import { tankStock } from '@/lib/milkTank';
import { productBatchStock, storeItemStocks, reverseRef, reversalDate } from '@/lib/stock';
import { nextNo } from '@/lib/numbering';

const path = (id) => `/production/${id}`;
const LOOSE_UNITS = ['litre', 'kg'];
const TX = { timeout: 30000 }; // closing a big batch is many writes; the database is far away (Neon, Singapore)

/** Batch row locked for this transaction: a double tap or a second phone waits, then sees the new status. */
async function openBatch(tx, id) {
  await lock(tx, 'batch', id);
  const b = await tx.batch.findUnique({ where: { id } });
  if (!b) throw new UserError('Batch not found');
  if (b.status !== 'OPEN') throw new UserError(`Batch is ${b.status.toLowerCase()} and cannot be changed`);
  return b;
}
const inOpenBatch = (id, fn) => prisma.$transaction(async (tx) => fn(tx, await openBatch(tx, id)));

export async function createBatch(formData) {
  await run('/production', async () => {
    const user = await requireEdit('production');
    const date = entryDate(formData, user);
    const prefix = `B${bsCompact(date)}-`;
    let b;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        b = await prisma.batch.create({ data: { batchNo: await nextNo(prisma, 'batch', 'batchNo', prefix), date: toDateOnly(date), note: optStr(formData, 'note'), createdById: user.id } });
        break;
      } catch (e) {
        if (e?.code !== 'P2002' || attempt === 2) throw e;
      }
    }
    await audit({ userId: user.id, action: 'CREATE', entity: 'Batch', entityId: b.id, after: b });
    revalidatePath('/production');
    return `${path(b.id)}?ok=${encodeURIComponent(`Batch ${b.batchNo} opened. Enter the milk taken from the tank first.`)}`;
  });
}

export async function updateHeader(id, formData) {
  await run(path(id), async () => {
    const user = await requireEdit('production');
    const data = { fatPct: optNum(formData, 'fatPct', 'Fat %'), snfPct: optNum(formData, 'snfPct', 'SNF %'), note: optStr(formData, 'note') };
    if (data.fatPct !== null && (data.fatPct < 0 || data.fatPct > 15)) throw new UserError('Fat % looks wrong');
    if (data.snfPct !== null && (data.snfPct < 0 || data.snfPct > 15)) throw new UserError('SNF % looks wrong');
    await inOpenBatch(id, async (tx) => {
      await tx.batch.update({ where: { id }, data });
      await audit({ userId: user.id, action: 'UPDATE', entity: 'Batch', entityId: id, after: data }, tx);
    });
  });
}

/** Milk taken from the tank into the batch: litres, with fat / SNF % for the fat balance. */
export async function addInput(id, formData) {
  await run(path(id), async () => {
    const user = await requireEdit('production');
    const litres = reqNum(formData, 'litres', 'Litres');
    if (litres <= 0) throw new UserError('Litres must be above 0');
    const fatPct = optNum(formData, 'fatPct', 'Fat %');
    const snfPct = optNum(formData, 'snfPct', 'SNF %');
    if (fatPct !== null && (fatPct < 0 || fatPct > 15)) throw new UserError('Fat % looks wrong');
    if (snfPct !== null && (snfPct < 0 || snfPct > 15)) throw new UserError('SNF % looks wrong');
    await inOpenBatch(id, async (tx, b) => {
      // The tank is worked out from receipts and batches; milk entered on an old batch would count on that old day.
      if (isoOf(b.date) < todayISO() && !canEdit(user.role, 'approve')) throw new UserError(`This batch is dated ${isoOf(b.date)}. Milk taken today goes in a batch dated today.`);
      await lock(tx, 'tank');
      const inTank = await tankStock(undefined, tx);
      if (litres > inTank + 0.5) throw new UserError(`Only ${Math.round(inTank)} L in the milk tank. Accept the waiting tankers first, or check the litres (${litres}).`);
      const input = await tx.batchInput.create({ data: { batchId: id, litres, fatPct, snfPct } });
      await audit({ userId: user.id, action: 'CREATE', entity: 'BatchInput', entityId: input.id, after: { batchNo: b.batchNo, litres, fatPct, snfPct } }, tx);
    });
    revalidatePath('/silos');
    return `${path(id)}?ok=${encodeURIComponent(`${litres} L taken from the milk tank`)}`;
  });
}

export async function removeInput(id, inputId) {
  await run(path(id), async () => {
    const user = await requireEdit('production');
    await inOpenBatch(id, async (tx) => {
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
    const productId = reqNum(formData, 'productId', 'Product');
    const units = reqNum(formData, 'units', 'Quantity');
    if (units <= 0) throw new UserError('Quantity must be above 0');
    const p = await prisma.product.findUnique({ where: { id: productId } });
    if (!p || !p.active) throw new UserError('Pick a product');
    if (!LOOSE_UNITS.includes(p.unitName.toLowerCase()) && !Number.isInteger(units)) throw new UserError(`${p.name} is counted in ${p.unitName}s — enter a whole number`);
    let total = units;
    await inOpenBatch(id, async (tx, b) => {
      const row = await tx.batchOutput.create({ data: { batchId: id, productId, units, litres: round(units * p.litresPerUnit, 3), expiryDate: toDateOnly(addDays(isoOf(b.date), p.shelfLifeDays)) } });
      total = (await tx.batchOutput.aggregate({ where: { batchId: id, productId }, _sum: { units: true } }))._sum.units;
      await audit({ userId: user.id, action: 'CREATE', entity: 'BatchOutput', entityId: row.id, after: { batchNo: b.batchNo, product: p.code, units } }, tx);
    });
    return `${path(id)}?ok=${encodeURIComponent(`+${qty(units)} ${p.name} · ${qty(total)} ${p.unitName} in this batch so far`)}`;
  });
}

export async function addLoss(id, formData) {
  await run(path(id), async () => {
    const user = await requireEdit('production');
    const litres = reqNum(formData, 'litres', 'Litres');
    if (litres <= 0) throw new UserError('Litres must be above 0');
    const reason = await prisma.lossReason.findUnique({ where: { id: reqNum(formData, 'reasonId', 'Reason') } });
    if (!reason || !reason.active) throw new UserError('Pick a reason');
    await inOpenBatch(id, async (tx, b) => {
      const row = await tx.batchLoss.create({ data: { batchId: id, reasonId: reason.id, litres, note: optStr(formData, 'note') } });
      await audit({ userId: user.id, action: 'CREATE', entity: 'BatchLoss', entityId: row.id, after: { batchNo: b.batchNo, reason: reason.name, litres } }, tx);
    });
  });
}

export async function addByProduct(id, formData) {
  await run(path(id), async () => {
    const user = await requireEdit('production');
    const litres = reqNum(formData, 'litres', 'Litres');
    if (litres <= 0) throw new UserError('Litres must be above 0');
    const name = reqStr(formData, 'name', 'Name');
    await inOpenBatch(id, async (tx, b) => {
      const row = await tx.batchByProduct.create({ data: { batchId: id, name, litres } });
      await audit({ userId: user.id, action: 'CREATE', entity: 'BatchByProduct', entityId: row.id, after: { batchNo: b.batchNo, ...row } }, tx);
    });
  });
}

export async function addPackaging(id, formData) {
  await run(path(id), async () => {
    const user = await requireEdit('production');
    const qtyUsed = reqNum(formData, 'qtyUsed', 'Quantity used');
    if (qtyUsed <= 0) throw new UserError('Quantity must be above 0');
    const item = await prisma.packagingItem.findUnique({ where: { id: reqNum(formData, 'packagingItemId', 'Item') } });
    if (!item) throw new UserError('Pick an item');
    await inOpenBatch(id, async (tx, b) => {
      const row = await tx.batchPackaging.create({ data: { batchId: id, packagingItemId: item.id, qtyUsed } });
      await audit({ userId: user.id, action: 'CREATE', entity: 'BatchPackaging', entityId: row.id, after: { batchNo: b.batchNo, item: item.name, qtyUsed } }, tx);
    });
  });
}

export async function addIngredient(id, formData) {
  await run(path(id), async () => {
    const user = await requireEdit('production');
    const q = reqNum(formData, 'qty', 'Quantity');
    if (q <= 0) throw new UserError('Quantity must be above 0');
    const item = await prisma.packagingItem.findUnique({ where: { id: reqNum(formData, 'packagingItemId', 'Ingredient') } });
    if (!item) throw new UserError('Pick an ingredient');
    await inOpenBatch(id, async (tx, b) => {
      const row = await tx.batchIngredient.create({ data: { batchId: id, packagingItemId: item.id, qty: q } });
      await audit({ userId: user.id, action: 'CREATE', entity: 'BatchIngredient', entityId: row.id, after: { batchNo: b.batchNo, item: item.name, qty: q } }, tx);
    });
  });
}

const LINE_MODELS = { output: 'batchOutput', loss: 'batchLoss', byproduct: 'batchByProduct', packaging: 'batchPackaging', ingredient: 'batchIngredient' };

export async function removeLine(id, kind, lineId) {
  await run(path(id), async () => {
    const user = await requireEdit('production');
    const model = LINE_MODELS[kind];
    if (!model) throw new UserError('Unknown line');
    await inOpenBatch(id, async (tx) => {
      const before = await tx[model].findUnique({ where: { id: lineId } });
      if (!before || before.batchId !== id) throw new UserError('Line not found');
      await tx[model].delete({ where: { id: lineId } });
      await audit({ userId: user.id, action: 'DELETE', entity: model, entityId: lineId, before }, tx);
    });
  });
}

export async function closeBatch(id, formData) {
  await run(path(id), async () => {
    const user = await requireEdit('production');
    const density = await getDensity();
    const tol = (await getTolerances()).PRODUCTION_LOSS;
    const closingNote = optStr(formData, 'closingNote');
    let shortInStore = [];
    let autoPkg = 0;
    await prisma.$transaction(async (tx) => {
      await openBatch(tx, id);
      const b = await tx.batch.findUnique({ where: { id }, include: { inputs: true, outputs: true, losses: true, byProducts: true, packaging: true, ingredients: true } });
      if (!b.inputs.length) throw new UserError('Enter the milk taken from the tank before closing');
      // A batch that failed (curd did not set) closes with no output and a note, so its milk is booked as lost — not put back in the tank.
      if (!b.outputs.length && !closingNote) throw new UserError('Enter the product output. If the batch failed and nothing was packed, write a closing note saying so.');
      const s = batchSummary(b, density);
      const f = flag(s.unexplainedPct, tol);
      if (s.unexplainedL < -0.5 && Math.abs(s.unexplainedPct) > tol.amberPct && !closingNote) throw new UserError(`Output + losses are ${Math.abs(Math.round(s.unexplainedL))} L MORE than the milk taken. Check the entries, or write a closing note (e.g. SMP added).`);
      if (f === 'red' && !closingNote) throw new UserError(`Loss is ${s.unexplainedPct}% (above ${tol.amberPct}%). Write a closing note explaining it.`);
      // Posted on the batch's day, or today if that day's cold room count is already booked.
      const on = toDateOnly(await reversalDate(tx, isoOf(b.date)));

      // Packaging nobody entered is taken out as the bill of materials expects, so the store still goes down.
      const bom = await tx.productPackaging.findMany({ where: { productId: { in: b.outputs.map((o) => o.productId) } } });
      const bomByProduct = {};
      for (const r of bom) (bomByProduct[r.productId] ||= []).push(r);
      const entered = new Set(b.packaging.map((p) => p.packagingItemId));
      for (const [itemId, q] of Object.entries(expectedPackaging(b.outputs, bomByProduct))) {
        if (entered.has(Number(itemId)) || q <= 0) continue;
        b.packaging.push(await tx.batchPackaging.create({ data: { batchId: id, packagingItemId: Number(itemId), qtyUsed: round(q, 3) } }));
        autoPkg++;
      }

      const before = await storeItemStocks(tx);
      const issued = {};
      for (const o of b.outputs) {
        await lock(tx, 'product', o.productId);
        await tx.stockLedger.create({ data: { date: on, productId: o.productId, batchNo: b.batchNo, expiryDate: o.expiryDate, type: 'PRODUCTION_IN', qtyUnits: o.units, refType: 'BatchOutput', refId: o.id, createdById: user.id } });
      }
      for (const p of b.packaging) {
        issued[p.packagingItemId] = (issued[p.packagingItemId] || 0) + p.qtyUsed;
        await tx.packagingLedger.create({ data: { date: on, packagingItemId: p.packagingItemId, type: 'ISSUE', qty: -p.qtyUsed, refType: 'BatchPackaging', refId: p.id, note: `Batch ${b.batchNo}`, createdById: user.id } });
      }
      for (const g of b.ingredients) {
        issued[g.packagingItemId] = (issued[g.packagingItemId] || 0) + g.qty;
        await tx.packagingLedger.create({ data: { date: on, packagingItemId: g.packagingItemId, type: 'ISSUE', qty: -g.qty, party: 'Production', refType: 'BatchIngredient', refId: g.id, note: `Added to batch ${b.batchNo}`, createdById: user.id } });
      }
      // Closing never waits for a late store receipt, but the store keeper must hear about it.
      const ids = Object.keys(issued).map(Number).filter((i) => (before[i] || 0) - issued[i] < -0.0001);
      if (ids.length) {
        const items = await tx.packagingItem.findMany({ where: { id: { in: ids } } });
        shortInStore = items.map((i) => `${i.name} ${qty(round((before[i.id] || 0) - issued[i.id], 2))} ${i.unit}`);
      }
      await tx.batch.update({ where: { id }, data: { status: 'CLOSED', closedById: user.id, closedAt: new Date(), note: closingNote ? [b.note, `Closing: ${closingNote}`].filter(Boolean).join(' · ') : b.note } });
      await audit({ userId: user.id, action: 'CLOSE', entity: 'Batch', entityId: id, after: { batchNo: b.batchNo, ...s, flag: f, autoPackaging: autoPkg, storeNegative: shortInStore }, reason: closingNote }, tx);
    }, TX);
    revalidatePath('/production');
    revalidatePath('/store');
    revalidatePath('/general-store');
    const parts = ['Batch closed and stock sent to the cold room.'];
    if (autoPkg) parts.push(`${autoPkg} packaging item${autoPkg > 1 ? 's' : ''} booked as expected (none entered).`);
    if (shortInStore.length) parts.push(`General store is now below zero — enter the missing store receipts: ${shortInStore.join(', ')}.`);
    return `${path(id)}?ok=${encodeURIComponent(parts.join(' '))}`;
  });
}

/**
 * Manager: reopen a closed batch to correct it (wrong count, missed bucket). Its products come back out of the
 * cold room and its packaging goes back to the store; closing again posts the corrected figures.
 * Refused once any of its products have been sent out — correct those through the cold room instead.
 */
export async function reopenBatch(id, formData) {
  await run(path(id), async () => {
    const user = await requireEdit('approve');
    const reason = reqStr(formData, 'reason', 'Reason');
    await prisma.$transaction(async (tx) => {
      await lock(tx, 'batch', id);
      const b = await tx.batch.findUnique({ where: { id }, include: { outputs: { include: { product: true } }, packaging: true, ingredients: true } });
      if (!b || b.status !== 'CLOSED') throw new UserError('Only a closed batch can be reopened');
      const need = {};
      for (const o of b.outputs) need[o.productId] = { product: o.product, units: (need[o.productId]?.units || 0) + o.units };
      const gone = [];
      for (const { product, units } of Object.values(need)) {
        await lock(tx, 'product', product.id);
        const left = (await productBatchStock(tx, product.id)).filter((l) => l.batchNo === b.batchNo).reduce((a, l) => a + l.qty, 0);
        if (left + 0.0001 < units) gone.push(`${product.name}: ${qty(round(units - left, 3))} of ${qty(units)} already sent out`);
      }
      if (gone.length) throw new UserError(`Cannot reopen — ${gone.join('; ')}. Correct it with a cold room receipt or used / damage entry instead.`);
      const on = toDateOnly(await reversalDate(tx, isoOf(b.date)));
      const note = `Batch ${b.batchNo} reopened: ${reason}`;
      for (const o of b.outputs) await reverseRef(tx, { refType: 'BatchOutput', refId: o.id, date: on, note, userId: user.id });
      const pkgRows = await tx.packagingLedger.findMany({ where: { OR: [{ refType: 'BatchPackaging', refId: { in: b.packaging.map((p) => p.id) } }, { refType: 'BatchIngredient', refId: { in: b.ingredients.map((g) => g.id) } }] } });
      const net = {};
      for (const r of pkgRows) (net[`${r.refType}|${r.refId}`] ||= { ...r, qty: 0 }).qty += r.qty;
      for (const r of Object.values(net)) {
        if (Math.abs(r.qty) < 0.0001) continue;
        await tx.packagingLedger.create({ data: { date: on, packagingItemId: r.packagingItemId, type: 'ISSUE', qty: -round(r.qty, 3), party: r.party, refType: r.refType, refId: r.refId, note, createdById: user.id } });
      }
      await tx.batch.update({ where: { id }, data: { status: 'OPEN', closedById: null, closedAt: null } });
      await audit({ userId: user.id, action: 'REOPEN', entity: 'Batch', entityId: id, reason }, tx);
    }, TX);
    revalidatePath('/production');
    revalidatePath('/store');
    revalidatePath('/general-store');
    return `${path(id)}?ok=${encodeURIComponent('Batch reopened. Its products are out of the cold room until you close it again.')}`;
  });
}

export async function cancelBatch(id, formData) {
  await run(path(id), async () => {
    const user = await requireEdit('approve');
    const reason = reqStr(formData, 'reason', 'Reason');
    await inOpenBatch(id, async (tx) => {
      await tx.batch.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: reason } });
      await audit({ userId: user.id, action: 'CANCEL', entity: 'Batch', entityId: id, reason }, tx);
    });
    revalidatePath('/production');
    revalidatePath('/silos');
    return `${path(id)}?ok=${encodeURIComponent('Batch cancelled. Its milk is back in the milk tank.')}`;
  });
}
