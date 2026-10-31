import { prisma } from './db';
import { toDateOnly, isoOf, todayISO } from './dates';
import { round } from './format';
import { UserError, lock } from './forms';

const EPS = 0.0001;

/**
 * The cold room day `iso` is closed once a count on that day or later has been booked.
 * Postings into a closed day would change a record that was already counted and signed off,
 * so new entries are refused there and corrections (cancellations) are posted on today instead.
 */
export async function dayClosed(tx, iso) {
  const c = await tx.stockCount.findFirst({ where: { adjusted: true, date: { gte: toDateOnly(iso) } }, orderBy: { date: 'desc' }, select: { date: true } });
  return c ? isoOf(c.date) : null;
}

/** Refuse a new cold room posting into a day whose count is already booked. */
export async function assertDayOpen(tx, iso) {
  if (iso >= todayISO()) return; // today always takes entries (late returns after the evening count)
  const closedOn = await dayClosed(tx, iso);
  if (closedOn) throw new UserError(`The cold room count for ${closedOn === iso ? 'that day' : 'a later day'} is already booked, so ${iso} is closed. Enter it with today's date.`);
}

/** Date to post a reversal on: the original day if it is still open, otherwise today. */
export async function reversalDate(tx, iso) {
  return iso < todayISO() && (await dayClosed(tx, iso)) ? todayISO() : iso;
}

/** Finished-goods stock by product and batch (only non-zero rows). */
export async function productBatchStock(tx = prisma, productId) {
  const rows = await tx.stockLedger.groupBy({ by: ['productId', 'batchNo', 'expiryDate'], where: productId ? { productId } : {}, _sum: { qtyUnits: true } });
  return rows.filter((r) => Math.abs(r._sum.qtyUnits || 0) > EPS).map((r) => ({ productId: r.productId, batchNo: r.batchNo, expiryDate: r.expiryDate, qty: round(r._sum.qtyUnits, 3) }));
}

/** Book stock per product as of a date (inclusive), or now: { [productId]: qty } */
export async function productStocks(asOfIso, tx = prisma) {
  const where = asOfIso ? { date: { lte: toDateOnly(asOfIso) } } : {};
  const rows = await tx.stockLedger.groupBy({ by: ['productId'], where, _sum: { qtyUnits: true } });
  return Object.fromEntries(rows.map((r) => [r.productId, round(r._sum.qtyUnits || 0, 3)]));
}

/** Lots to take `qty` from, oldest expiry first (lots without expiry — returns, adjustments — go first). */
export async function allocateFifo(tx, product, qty) {
  const all = await productBatchStock(tx, product.id);
  const lots = all.filter((l) => l.qty > EPS);
  lots.sort((a, b) => isoOf(a.expiryDate).localeCompare(isoOf(b.expiryDate)) || String(a.batchNo).localeCompare(String(b.batchNo)));
  // Net stock counts lots that went below zero (e.g. a cancelled receipt whose lot was already sent out).
  const have = Math.min(lots.reduce((a, l) => a + l.qty, 0), all.reduce((a, l) => a + l.qty, 0));
  if (have + EPS < qty) throw new UserError(`Only ${round(Math.max(0, have), 2)} ${product.unitName} of ${product.name} in stock (need ${qty})`);
  const out = [];
  let left = qty;
  for (const l of lots) {
    if (left <= EPS) break;
    const take = round(Math.min(l.qty, left), 3);
    out.push({ batchNo: l.batchNo, expiryDate: l.expiryDate, qty: take });
    left = round(left - take, 3);
  }
  return out;
}

/** Post a stock movement out of the cold room, FIFO across lots. */
export async function postOut(tx, { product, qty, date, type, refType, refId, note, userId }) {
  await lock(tx, 'product', product.id); // two challans for the same product at once must not both see the same stock
  const lots = await allocateFifo(tx, product, qty);
  for (const l of lots) {
    await tx.stockLedger.create({ data: { date, productId: product.id, batchNo: l.batchNo, expiryDate: l.expiryDate, type, qtyUnits: -l.qty, refType, refId, note, createdById: userId } });
  }
  return lots;
}

/** Undo every ledger row of a reference by posting the same type with the opposite sign. */
export async function reverseRef(tx, { refType, refId, date, note, userId }) {
  const rows = await tx.stockLedger.findMany({ where: { refType, refId } });
  const net = {};
  for (const r of rows) {
    const k = [r.productId, r.batchNo, isoOf(r.expiryDate), r.type].join('|');
    (net[k] ||= { ...r, qtyUnits: 0 }).qtyUnits += r.qtyUnits;
  }
  for (const r of Object.values(net)) {
    if (Math.abs(r.qtyUnits) < EPS) continue;
    await tx.stockLedger.create({ data: { date, productId: r.productId, batchNo: r.batchNo, expiryDate: r.expiryDate, type: r.type, qtyUnits: -round(r.qtyUnits, 3), refType, refId, note, createdById: userId } });
  }
}

export function daysLeft(expiry) {
  if (!expiry) return null;
  const ms = toDateOnly(isoOf(expiry)) - toDateOnly(todayISO());
  return Math.round(ms / 864e5);
}

// Ledger type → column of the cold room register.
const COLUMN = { OPENING: 'opening', PRODUCTION_IN: 'production', RECEIPT_IN: 'production', DISPATCH_OUT: 'going', RETURN_IN: 'returned', DAMAGE: 'damage', COUNT_ADJ: 'adjust' };

/**
 * Cold room register for a period, like the Excel sheet:
 * opening + production − market going + market return − used/damage ± count adj = stock; count and difference on the last day.
 */
export async function coldroomRegister(from, to) {
  const [products, before, period, counts] = await Promise.all([
    prisma.product.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.stockLedger.groupBy({ by: ['productId'], where: { date: { lt: toDateOnly(from) } }, _sum: { qtyUnits: true } }),
    prisma.stockLedger.groupBy({ by: ['productId', 'type'], where: { date: { gte: toDateOnly(from), lte: toDateOnly(to) } }, _sum: { qtyUnits: true } }),
    prisma.stockCount.findMany({ where: { date: toDateOnly(to) } }),
  ]);
  const rows = {};
  const blank = () => ({ opening: 0, production: 0, going: 0, returned: 0, damage: 0, adjust: 0 });
  for (const r of before) (rows[r.productId] ||= blank()).opening += r._sum.qtyUnits || 0;
  for (const r of period) {
    const col = COLUMN[r.type] || 'adjust';
    const v = r._sum.qtyUnits || 0;
    // Outgoing columns are shown as positive numbers.
    (rows[r.productId] ||= blank())[col] += col === 'going' || col === 'damage' ? -v : v;
  }
  const countBy = Object.fromEntries(counts.map((c) => [c.productId, c]));
  return products
    .filter((p) => p.active || rows[p.id])
    .map((p) => {
      const r = rows[p.id] || blank();
      for (const k in r) r[k] = round(r[k], 3);
      const stock = round(r.opening + r.production - r.going + r.returned - r.damage + r.adjust, 3);
      const c = countBy[p.id];
      // Once the difference is booked as an adjustment, stock equals the count; show the difference that was found.
      const diff = c ? (c.adjusted ? c.diffQty : round(c.countQty - stock, 3)) : null;
      return { product: p, ...r, stock, count: c ? c.countQty : null, diff, remark: c?.remark || '' };
    });
}

/** General store register for a period: opening, received, issued, adjusted, closing per item. */
export async function generalStoreRegister(from, to) {
  const [items, before, period] = await Promise.all([
    prisma.packagingItem.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] }),
    prisma.packagingLedger.groupBy({ by: ['packagingItemId'], where: { date: { lt: toDateOnly(from) } }, _sum: { qty: true } }),
    prisma.packagingLedger.groupBy({ by: ['packagingItemId', 'type'], where: { date: { gte: toDateOnly(from), lte: toDateOnly(to) } }, _sum: { qty: true } }),
  ]);
  const rows = {};
  const blank = () => ({ opening: 0, received: 0, issued: 0, adjust: 0 });
  for (const r of before) (rows[r.packagingItemId] ||= blank()).opening += r._sum.qty || 0;
  for (const r of period) {
    const row = (rows[r.packagingItemId] ||= blank());
    const v = r._sum.qty || 0;
    if (r.type === 'OPENING') row.opening += v;
    else if (r.type === 'RECEIPT') row.received += v;
    else if (r.type === 'ISSUE') row.issued -= v;
    else row.adjust += v;
  }
  return items
    .filter((i) => i.active || rows[i.id])
    .map((i) => {
      const r = rows[i.id] || blank();
      for (const k in r) r[k] = round(r[k], 3);
      const closing = round(r.opening + r.received - r.issued + r.adjust, 3);
      return { item: i, ...r, closing, low: i.reorderLevel !== null && closing <= i.reorderLevel };
    });
}

/** Stock of every general store item now: { [itemId]: qty } */
export async function storeItemStocks(tx = prisma) {
  const rows = await tx.packagingLedger.groupBy({ by: ['packagingItemId'], _sum: { qty: true } });
  return Object.fromEntries(rows.map((r) => [r.packagingItemId, round(r._sum.qty || 0, 3)]));
}
