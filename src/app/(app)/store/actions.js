'use server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireEdit } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { run, UserError, reqNum, optNum, reqStr, optStr, str, bool, entryDate, pageDate, lock } from '@/lib/forms';
import { toDateOnly, todayISO, bsCompact, addDays, isoOf } from '@/lib/dates';
import { postOut, reverseRef, productStocks, assertDayOpen, reversalDate } from '@/lib/stock';
import { round } from '@/lib/format';

const LOOSE_UNITS = ['litre', 'kg'];
const KINDS = ['RECEIPT', 'RETURN', 'DAMAGE', 'OPENING'];

const isLoose = (p) => LOOSE_UNITS.includes(p.unitName.toLowerCase());

function checkQty(p, qty) {
  if (qty <= 0) throw new UserError('Quantity must be above 0');
  if (!isLoose(p) && !Number.isInteger(qty)) throw new UserError(`${p.name} is counted in ${p.unitName}s — enter a whole number`);
}

function revalidateStore() {
  revalidatePath('/store');
  revalidatePath('/store/entries');
  revalidatePath('/reports/coldroom');
}

export async function addStoreEntry(formData) {
  const kind = str(formData, 'kind');
  const back = `/store/entries?date=${str(formData, 'date') || todayISO()}`;
  await run(back, async () => {
    if (!KINDS.includes(kind)) throw new UserError('Unknown entry type');
    const user = await requireEdit(kind === 'OPENING' ? 'approve' : 'store');
    const date = entryDate(formData, user);
    const d = toDateOnly(date);
    const productId = reqNum(formData, 'productId', 'Product');
    const qty = reqNum(formData, 'qty', 'Quantity');
    const p = await prisma.product.findUnique({ where: { id: productId } });
    if (!p) throw new UserError('Pick a product');
    checkQty(p, qty);
    const reasonId = optNum(formData, 'reasonId');
    const distributorId = optNum(formData, 'distributorId');
    const sellable = kind === 'RETURN' ? bool(formData, 'sellable') : true;
    const note = optStr(formData, 'note');
    if (kind === 'DAMAGE' && !reasonId) throw new UserError('Pick a reason for the damage / use');
    if (kind === 'RETURN' && !sellable && !reasonId) throw new UserError('Pick a reason for a return that is not sellable');

    await prisma.$transaction(async (tx) => {
      await lock(tx, 'product', productId);
      await assertDayOpen(tx, date);
      if (kind === 'OPENING') {
        // Opening stock is entered once per product; a second one (double tap, or months later) would silently add stock.
        const had = await tx.storeEntry.findFirst({ where: { kind: 'OPENING', productId, status: 'POSTED' } });
        if (had) throw new UserError(`${p.name} already has opening stock (${had.qty} on ${isoOf(had.date)}). Cancel that entry first to change it.`);
      }
      const e = await tx.storeEntry.create({ data: { date: d, kind, productId, qty, reasonId, distributorId, sellable, note, createdById: user.id } });
      const ref = { refType: 'StoreEntry', refId: e.id, createdById: user.id, date: d, productId };
      if (kind === 'RECEIPT') {
        const batchNo = optStr(formData, 'batchNo') || `R${bsCompact(date)}`;
        const expiry = str(formData, 'expiryDate') || addDays(date, p.shelfLifeDays);
        await tx.stockLedger.create({ data: { ...ref, batchNo, expiryDate: toDateOnly(expiry), type: 'RECEIPT_IN', qtyUnits: qty, note } });
      } else if (kind === 'OPENING') {
        await tx.stockLedger.create({ data: { ...ref, batchNo: 'OPENING', expiryDate: null, type: 'OPENING', qtyUnits: qty, note: note || 'Opening stock' } });
      } else if (kind === 'RETURN') {
        const reason = reasonId ? await tx.lossReason.findUnique({ where: { id: reasonId } }) : null;
        await tx.stockLedger.create({ data: { ...ref, batchNo: 'RETURN', expiryDate: null, type: 'RETURN_IN', qtyUnits: qty, note: reason?.name || note } });
        // Unsellable returns come in and go straight out as damage, so both columns show it.
        if (!sellable) await tx.stockLedger.create({ data: { ...ref, batchNo: 'RETURN', expiryDate: null, type: 'DAMAGE', qtyUnits: -qty, note: `Return not sellable${reason ? `: ${reason.name}` : ''}` } });
      } else {
        const reason = await tx.lossReason.findUnique({ where: { id: reasonId } });
        await postOut(tx, { product: p, qty, date: d, type: 'DAMAGE', refType: 'StoreEntry', refId: e.id, note: reason?.name, userId: user.id });
      }
      await audit({ userId: user.id, action: 'CREATE', entity: 'StoreEntry', entityId: e.id, after: { kind, product: p.code, qty, sellable } }, tx);
    });
    revalidateStore();
    const label = { RECEIPT: 'Receipt', RETURN: 'Market return', DAMAGE: 'Used / damage', OPENING: 'Opening stock' }[kind];
    return `${back}&ok=${encodeURIComponent(`${label} saved: ${p.name} ${qty} ${p.unitName}`)}`;
  });
}

/** Day 0: opening stock of every product from one page. Products that already have an opening are skipped. */
export async function saveOpeningStock(formData) {
  await run('/store/opening', async () => {
    const user = await requireEdit('approve');
    const date = entryDate(formData, user);
    const d = toDateOnly(date);
    const note = optStr(formData, 'note') || 'Opening stock';
    const products = await prisma.product.findMany();
    const rows = [];
    for (const p of products) {
      const qty = optNum(formData, `qty_${p.id}`, `${p.name} quantity`);
      if (qty === null || qty === 0) continue;
      checkQty(p, qty);
      rows.push({ p, qty });
    }
    if (!rows.length) throw new UserError('Enter at least one quantity');
    let saved = 0;
    const skipped = [];
    await prisma.$transaction(async (tx) => {
      for (const { p, qty } of rows) {
        await lock(tx, 'product', p.id);
        if (await tx.storeEntry.findFirst({ where: { kind: 'OPENING', productId: p.id, status: 'POSTED' } })) { skipped.push(p.name); continue; }
        const e = await tx.storeEntry.create({ data: { date: d, kind: 'OPENING', productId: p.id, qty, note, createdById: user.id } });
        await tx.stockLedger.create({ data: { date: d, productId: p.id, batchNo: 'OPENING', expiryDate: null, type: 'OPENING', qtyUnits: qty, refType: 'StoreEntry', refId: e.id, note, createdById: user.id } });
        saved++;
      }
      await audit({ userId: user.id, action: 'CREATE', entity: 'OpeningStock', entityId: date, after: { saved, skipped } }, tx);
    }, { timeout: 30000 });
    revalidateStore();
    const msg = `Opening stock saved for ${saved} product${saved === 1 ? '' : 's'}${skipped.length ? `. Already had opening stock (not changed): ${skipped.join(', ')}` : ''}`;
    return `/store/opening?ok=${encodeURIComponent(msg)}`;
  });
}

export async function cancelStoreEntry(id, formData) {
  await run('/store/entries', async () => {
    const user = await requireEdit('approve');
    const reason = reqStr(formData, 'reason', 'Reason');
    let back = '/store/entries';
    await prisma.$transaction(async (tx) => {
      await lock(tx, 'storeEntry', id);
      const e = await tx.storeEntry.findUnique({ where: { id }, include: { product: true } });
      if (!e || e.status !== 'POSTED') throw new UserError('Entry not found or already cancelled');
      await lock(tx, 'product', e.productId);
      back = `/store/entries?date=${isoOf(e.date)}`;
      const added = e.kind === 'DAMAGE' || (e.kind === 'RETURN' && !e.sellable) ? 0 : e.qty;
      if (added) {
        const now = (await productStocks(null, tx))[e.productId] || 0;
        if (now - added < -0.0001) throw new UserError(`Cannot cancel: only ${round(now, 2)} ${e.product.unitName} of ${e.product.name} left in stock`);
      }
      // Reversed on the entry's own day, or on today if that day's count is already booked.
      const on = await reversalDate(tx, isoOf(e.date));
      await reverseRef(tx, { refType: 'StoreEntry', refId: id, date: toDateOnly(on), note: `Cancelled${on !== isoOf(e.date) ? ` (entry of ${isoOf(e.date)})` : ''}: ${reason}`, userId: user.id });
      await tx.storeEntry.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: reason } });
      await audit({ userId: user.id, action: 'CANCEL', entity: 'StoreEntry', entityId: id, reason }, tx);
    });
    revalidateStore();
    return `${back}&ok=Entry cancelled and stock reversed`;
  });
}

export async function saveCounts(formData) {
  const date = pageDate(str(formData, 'date'));
  await run(`/store/count?date=${date}`, async () => {
    const user = await requireEdit('store');
    const d = toDateOnly(date);
    const [products, stocks, existing] = await Promise.all([
      prisma.product.findMany(),
      productStocks(date),
      prisma.stockCount.findMany({ where: { date: d } }),
    ]);
    const done = Object.fromEntries(existing.map((c) => [c.productId, c]));
    let saved = 0;
    for (const p of products) {
      const count = optNum(formData, `count_${p.id}`, `${p.name} count`);
      const remark = optStr(formData, `remark_${p.id}`);
      if (done[p.id]?.adjusted) continue;
      if (count === null) continue; // not counted (or counted by someone else) — keep what is saved
      if (count < 0) throw new UserError(`${p.name}: count cannot be negative`);
      if (!isLoose(p) && !Number.isInteger(count)) throw new UserError(`${p.name} is counted in ${p.unitName}s — enter a whole number`);
      const systemQty = stocks[p.id] || 0;
      const data = { countQty: count, systemQty, diffQty: round(count - systemQty, 3), remark, createdById: user.id };
      await prisma.stockCount.upsert({ where: { date_productId: { date: d, productId: p.id } }, create: { date: d, productId: p.id, ...data }, update: data });
      saved++;
    }
    await audit({ userId: user.id, action: 'UPDATE', entity: 'StockCount', entityId: date, after: { products: saved } });
    revalidatePath('/store/count');
    revalidatePath('/reports/coldroom');
    return `/store/count?date=${date}&ok=${encodeURIComponent(`Count saved for ${saved} products`)}`;
  });
}

export async function bookCountDifferences(formData) {
  const date = pageDate(str(formData, 'date'));
  await run(`/store/count?date=${date}`, async () => {
    const user = await requireEdit('approve');
    const d = toDateOnly(date);
    let booked = 0;
    await prisma.$transaction(async (tx) => {
      await lock(tx, 'count'); // a double tap must not book the same differences twice
      const later = await tx.stockCount.findFirst({ where: { adjusted: true, date: { gt: d } }, orderBy: { date: 'asc' } });
      if (later) throw new UserError(`The count of ${isoOf(later.date)} is already booked. Book days in order, oldest first.`);
      const counts = await tx.stockCount.findMany({ where: { date: d, adjusted: false }, include: { product: true } });
      const stocks = await productStocks(date, tx);
      for (const c of counts) {
        const systemQty = stocks[c.productId] || 0;
        const diff = round(c.countQty - systemQty, 3);
        if (Math.abs(diff) > 0.0001) {
          const note = `Count ${date}${c.remark ? `: ${c.remark}` : ''}`;
          if (diff < 0) await postOut(tx, { product: c.product, qty: -diff, date: d, type: 'COUNT_ADJ', refType: 'StockCount', refId: c.id, note, userId: user.id });
          else await tx.stockLedger.create({ data: { date: d, productId: c.productId, batchNo: 'COUNT', type: 'COUNT_ADJ', qtyUnits: diff, refType: 'StockCount', refId: c.id, note, createdById: user.id } });
          booked++;
        }
        await tx.stockCount.update({ where: { id: c.id }, data: { systemQty, diffQty: diff, adjusted: true } });
      }
      await audit({ userId: user.id, action: 'ADJUST', entity: 'StockCount', entityId: date, after: { booked } }, tx);
    });
    revalidateStore();
    revalidatePath('/store/count');
    return `/store/count?date=${date}&ok=${encodeURIComponent(booked ? `${booked} differences booked; stock now matches the count` : 'No differences to book')}`;
  });
}
