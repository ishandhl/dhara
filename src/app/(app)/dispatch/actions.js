'use server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireEdit } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { run, UserError, reqNum, optNum, reqStr, optStr, str, lock } from '@/lib/forms';
import { toDateOnly, todayISO, bsCompact, isoOf } from '@/lib/dates';
import { postOut, reverseRef, reversalDate } from '@/lib/stock';
import { round } from '@/lib/format';
import { nextNo } from '@/lib/numbering';

const path = (id) => `/dispatch/${id}`;
const LOOSE_UNITS = ['litre', 'kg'];

// Locks the challan for the rest of the transaction, so a double tap or a second phone waits and then sees the new status.
async function draft(tx, id) {
  await lock(tx, 'challan', id);
  const c = await tx.challan.findUnique({ where: { id } });
  if (!c) throw new UserError('Challan not found');
  if (c.status !== 'DRAFT') throw new UserError(`Challan is ${c.status.toLowerCase()} and cannot be changed`);
  return c;
}

export async function createChallan(formData) {
  await run('/dispatch', async () => {
    const user = await requireEdit('dispatch');
    const date = str(formData, 'date') || todayISO();
    if (date > todayISO()) throw new UserError('Date cannot be in the future');
    const prefix = `C${bsCompact(date)}-`;
    let c;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        c = await prisma.challan.create({ data: { challanNo: await nextNo(prisma, 'challan', 'challanNo', prefix), date: toDateOnly(date), distributorId: optNum(formData, 'distributorId'), vehicleId: optNum(formData, 'vehicleId'), note: optStr(formData, 'note'), createdById: user.id } });
        break;
      } catch (e) {
        if (e?.code !== 'P2002' || attempt === 2) throw e;
      }
    }
    await audit({ userId: user.id, action: 'CREATE', entity: 'Challan', entityId: c.id, after: c });
    revalidatePath('/dispatch');
    return `${path(c.id)}?ok=${encodeURIComponent(`Challan ${c.challanNo} created. Add the products going out.`)}`;
  });
}

export async function addChallanLine(id, formData) {
  await run(path(id), async () => {
    const user = await requireEdit('dispatch');
    const productId = reqNum(formData, 'productId', 'Product');
    const qty = reqNum(formData, 'qty', 'Quantity');
    if (qty <= 0) throw new UserError('Quantity must be above 0');
    const p = await prisma.product.findUnique({ where: { id: productId } });
    if (!p) throw new UserError('Pick a product');
    if (!LOOSE_UNITS.includes(p.unitName.toLowerCase()) && !Number.isInteger(qty)) throw new UserError(`${p.name} is counted in ${p.unitName}s — enter a whole number`);
    let total = qty;
    await prisma.$transaction(async (tx) => {
      await draft(tx, id);
      const existing = await tx.challanLine.findFirst({ where: { challanId: id, productId } });
      const row = existing
        ? await tx.challanLine.update({ where: { id: existing.id }, data: { qty: round(existing.qty + qty, 3) } })
        : await tx.challanLine.create({ data: { challanId: id, productId, qty } });
      total = row.qty;
      await audit({ userId: user.id, action: 'CREATE', entity: 'ChallanLine', entityId: row.id, after: { challanId: id, product: p.code, qty } }, tx);
    });
    // Adding a product that is already on the challan adds to its line — say so, so a repeated tap is noticed.
    const msg = total !== qty ? `Added ${qty} more ${p.name}: now ${total} ${p.unitName} on this challan` : `Added ${qty} ${p.unitName} ${p.name}`;
    return `${path(id)}?ok=${encodeURIComponent(msg)}`;
  });
}

export async function removeChallanLine(id, lineId) {
  await run(path(id), async () => {
    const user = await requireEdit('dispatch');
    await prisma.$transaction(async (tx) => {
      await draft(tx, id);
      const before = await tx.challanLine.findUnique({ where: { id: lineId } });
      if (!before || before.challanId !== id) throw new UserError('Line not found');
      await tx.challanLine.delete({ where: { id: lineId } });
      await audit({ userId: user.id, action: 'DELETE', entity: 'ChallanLine', entityId: lineId, before }, tx);
    });
  });
}

export async function updateChallan(id, formData) {
  await run(path(id), async () => {
    const user = await requireEdit('dispatch');
    const data = { distributorId: optNum(formData, 'distributorId'), vehicleId: optNum(formData, 'vehicleId'), note: optStr(formData, 'note') };
    await prisma.$transaction(async (tx) => {
      await draft(tx, id);
      await tx.challan.update({ where: { id }, data });
      await audit({ userId: user.id, action: 'UPDATE', entity: 'Challan', entityId: id, after: data }, tx);
    });
  });
}

export async function dispatchChallan(id) {
  await run(path(id), async () => {
    const user = await requireEdit('dispatch');
    // Stock leaves on the day the vehicle actually goes, even if the challan was prepared the evening before.
    const today = toDateOnly(todayISO());
    await prisma.$transaction(async (tx) => {
      const c = await draft(tx, id);
      const lines = await tx.challanLine.findMany({ where: { challanId: id }, include: { product: true } });
      if (!lines.length) throw new UserError('Add at least one product before dispatching');
      for (const l of lines) {
        await postOut(tx, { product: l.product, qty: l.qty, date: today, type: 'DISPATCH_OUT', refType: 'Challan', refId: id, note: `Challan ${c.challanNo}`, userId: user.id });
      }
      await tx.challan.update({ where: { id }, data: { status: 'DISPATCHED', dispatchedAt: new Date(), date: today } });
      await audit({ userId: user.id, action: 'DISPATCH', entity: 'Challan', entityId: id, after: { challanNo: c.challanNo, lines: lines.map((l) => [l.product.code, l.qty]) } }, tx);
    });
    revalidatePath('/dispatch');
    revalidatePath('/store');
    return `${path(id)}?ok=${encodeURIComponent('Dispatched. Stock taken out of the cold room, oldest expiry first.')}`;
  });
}

export async function cancelChallan(id, formData) {
  await run(path(id), async () => {
    const user = await requireEdit('approve');
    const reason = reqStr(formData, 'reason', 'Reason');
    await prisma.$transaction(async (tx) => {
      await lock(tx, 'challan', id);
      const c = await tx.challan.findUnique({ where: { id } });
      if (!c || c.status === 'CANCELLED') throw new UserError('Challan not found or already cancelled');
      // Stock comes back on the challan's day, or on today if that day's count is already booked.
      if (c.status === 'DISPATCHED') await reverseRef(tx, { refType: 'Challan', refId: id, date: toDateOnly(await reversalDate(tx, isoOf(c.date))), note: `Cancel challan ${c.challanNo}: ${reason}`, userId: user.id });
      await tx.challan.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: reason } });
      await audit({ userId: user.id, action: 'CANCEL', entity: 'Challan', entityId: id, reason }, tx);
    });
    revalidatePath('/dispatch');
    revalidatePath('/store');
    return `${path(id)}?ok=Challan cancelled`;
  });
}
