'use server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireEdit } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { run, UserError, reqNum, reqStr, optStr, str } from '@/lib/forms';
import { toDateOnly, todayISO } from '@/lib/dates';
import { storeItemStocks } from '@/lib/stock';
import { round } from '@/lib/format';

const KINDS = ['RECEIPT', 'ISSUE', 'COUNT', 'OPENING'];

export async function storeMovement(formData) {
  const back = str(formData, 'back') || '/general-store';
  await run(back, async () => {
    const kind = str(formData, 'kind');
    if (!KINDS.includes(kind)) throw new UserError('Unknown entry type');
    const user = await requireEdit(kind === 'OPENING' ? 'approve' : 'generalStore');
    const date = str(formData, 'date') || todayISO();
    if (date > todayISO()) throw new UserError('Date cannot be in the future');
    const itemId = reqNum(formData, 'itemId', 'Item');
    const q = reqNum(formData, 'qty', kind === 'COUNT' ? 'Counted quantity' : 'Quantity');
    if (kind === 'COUNT' ? q < 0 : q <= 0) throw new UserError('Quantity must be above 0');
    const party = optStr(formData, 'party');
    const note = optStr(formData, 'note');
    if (kind === 'ISSUE' && !party) throw new UserError('Pick the department it is issued to');
    let msg;
    await prisma.$transaction(async (tx) => {
      const item = await tx.packagingItem.findUnique({ where: { id: itemId } });
      if (!item) throw new UserError('Item not found');
      const stock = (await storeItemStocks(tx))[itemId] || 0;
      let type = kind;
      let signed = q;
      if (kind === 'ISSUE') {
        if (stock + 0.0001 < q) throw new UserError(`Only ${round(stock, 2)} ${item.unit} of ${item.name} in stock`);
        signed = -q;
      } else if (kind === 'COUNT') {
        type = 'COUNT_ADJ';
        signed = round(q - stock, 3);
        if (Math.abs(signed) < 0.0001) { msg = `${item.name}: count matches the system (${round(stock, 2)} ${item.unit})`; return; }
      }
      const row = await tx.packagingLedger.create({ data: { date: toDateOnly(date), packagingItemId: itemId, type, qty: signed, party, note: kind === 'COUNT' ? `Counted ${q}${note ? ` · ${note}` : ''}` : note, createdById: user.id } });
      await audit({ userId: user.id, action: 'CREATE', entity: 'StoreItemMovement', entityId: row.id, after: { item: item.name, type, qty: signed, party } }, tx);
      msg = kind === 'COUNT' ? `${item.name}: difference ${signed > 0 ? '+' : ''}${signed} ${item.unit} booked` : `${item.name}: ${kind.toLowerCase()} ${q} ${item.unit} saved`;
    });
    revalidatePath('/general-store');
    return `${back}${back.includes('?') ? '&' : '?'}ok=${encodeURIComponent(msg)}`;
  });
}

export async function cancelStoreMovement(id, formData) {
  const back = str(formData, 'back') || '/general-store';
  await run(back, async () => {
    const user = await requireEdit('approve');
    const reason = reqStr(formData, 'reason', 'Reason');
    await prisma.$transaction(async (tx) => {
      const m = await tx.packagingLedger.findUnique({ where: { id }, include: { packagingItem: true } });
      if (!m || m.cancelled) throw new UserError('Entry not found or already cancelled');
      if (m.refType) throw new UserError('This entry comes from a production batch and cannot be cancelled here');
      const stock = (await storeItemStocks(tx))[m.packagingItemId] || 0;
      if (stock - m.qty < -0.0001) throw new UserError(`Cannot cancel: only ${round(stock, 2)} ${m.packagingItem.unit} left`);
      await tx.packagingLedger.update({ where: { id }, data: { cancelled: true } });
      await tx.packagingLedger.create({ data: { date: m.date, packagingItemId: m.packagingItemId, type: m.type, qty: -m.qty, party: m.party, note: `Cancelled: ${reason}`, refType: 'PackagingLedger', refId: id, cancelled: true, createdById: user.id } });
      await audit({ userId: user.id, action: 'CANCEL', entity: 'StoreItemMovement', entityId: id, reason }, tx);
    });
    revalidatePath('/general-store');
    return `${back}${back.includes('?') ? '&' : '?'}ok=Entry cancelled`;
  });
}
