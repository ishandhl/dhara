'use server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireEdit } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { run, UserError, reqNum, optNum, reqStr, optStr, str } from '@/lib/forms';
import { toDateOnly, todayISO, bsCompact } from '@/lib/dates';
import { postOut, reverseRef } from '@/lib/stock';
import { round } from '@/lib/format';

const path = (id) => `/dispatch/${id}`;
const LOOSE_UNITS = ['litre', 'kg'];

async function draft(tx, id) {
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
      const last = await prisma.challan.findFirst({ where: { challanNo: { startsWith: prefix } }, orderBy: { challanNo: 'desc' } });
      const n = last ? parseInt(last.challanNo.slice(prefix.length), 10) + 1 : 1;
      try {
        c = await prisma.challan.create({ data: { challanNo: prefix + String(n).padStart(2, '0'), date: toDateOnly(date), distributorId: optNum(formData, 'distributorId'), vehicleId: optNum(formData, 'vehicleId'), note: optStr(formData, 'note'), createdById: user.id } });
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
    await draft(prisma, id);
    const productId = reqNum(formData, 'productId', 'Product');
    const qty = reqNum(formData, 'qty', 'Quantity');
    const p = await prisma.product.findUnique({ where: { id: productId } });
    if (qty <= 0) throw new UserError('Quantity must be above 0');
    if (!LOOSE_UNITS.includes(p.unitName) && !Number.isInteger(qty)) throw new UserError(`${p.name} is counted in ${p.unitName}s — enter a whole number`);
    const existing = await prisma.challanLine.findFirst({ where: { challanId: id, productId } });
    const row = existing
      ? await prisma.challanLine.update({ where: { id: existing.id }, data: { qty: round(existing.qty + qty, 3) } })
      : await prisma.challanLine.create({ data: { challanId: id, productId, qty } });
    await audit({ userId: user.id, action: 'CREATE', entity: 'ChallanLine', entityId: row.id, after: { challanId: id, product: p.code, qty } });
  });
}

export async function removeChallanLine(id, lineId) {
  await run(path(id), async () => {
    const user = await requireEdit('dispatch');
    await draft(prisma, id);
    const before = await prisma.challanLine.findUnique({ where: { id: lineId } });
    if (!before || before.challanId !== id) throw new UserError('Line not found');
    await prisma.challanLine.delete({ where: { id: lineId } });
    await audit({ userId: user.id, action: 'DELETE', entity: 'ChallanLine', entityId: lineId, before });
  });
}

export async function updateChallan(id, formData) {
  await run(path(id), async () => {
    const user = await requireEdit('dispatch');
    await draft(prisma, id);
    const data = { distributorId: optNum(formData, 'distributorId'), vehicleId: optNum(formData, 'vehicleId'), note: optStr(formData, 'note') };
    await prisma.challan.update({ where: { id }, data });
    await audit({ userId: user.id, action: 'UPDATE', entity: 'Challan', entityId: id, after: data });
  });
}

export async function dispatchChallan(id) {
  await run(path(id), async () => {
    const user = await requireEdit('dispatch');
    await prisma.$transaction(async (tx) => {
      const c = await draft(tx, id);
      const lines = await tx.challanLine.findMany({ where: { challanId: id }, include: { product: true } });
      if (!lines.length) throw new UserError('Add at least one product before dispatching');
      for (const l of lines) {
        await postOut(tx, { product: l.product, qty: l.qty, date: c.date, type: 'DISPATCH_OUT', refType: 'Challan', refId: id, note: `Challan ${c.challanNo}`, userId: user.id });
      }
      await tx.challan.update({ where: { id }, data: { status: 'DISPATCHED', dispatchedAt: new Date() } });
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
      const c = await tx.challan.findUnique({ where: { id } });
      if (!c || c.status === 'CANCELLED') throw new UserError('Challan not found or already cancelled');
      if (c.status === 'DISPATCHED') await reverseRef(tx, { refType: 'Challan', refId: id, date: c.date, note: `Cancel challan ${c.challanNo}: ${reason}`, userId: user.id });
      await tx.challan.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: reason } });
      await audit({ userId: user.id, action: 'CANCEL', entity: 'Challan', entityId: id, reason }, tx);
    });
    revalidatePath('/dispatch');
    revalidatePath('/store');
    return `${path(id)}?ok=Challan cancelled`;
  });
}
