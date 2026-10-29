// One milk tank for the whole plant. Its stock is worked out from what is already entered:
//   + milk accepted at QC  − milk allocated to production batches  ± manager adjustments (incl. opening stock)
// so it can never drift from the QC and production records. Adjustments and dip readings are stored
// against a single Silo row called "Milk tank" (created on first use).
import { prisma } from './db';
import { toDateOnly, isoOf } from './dates';
import { round } from './format';

export const TANK_NAME = 'Milk tank';
const ACCEPTED = ['ACCEPTED', 'UNLOADED'];

/** The tank's Silo row, created the first time it is needed. */
export async function tankRow(tx = prisma) {
  const found = await tx.silo.findUnique({ where: { name: TANK_NAME } });
  return found || tx.silo.create({ data: { name: TANK_NAME, capacityL: 1000000, correctionFactor: 1 } });
}

const where = (field, from, to) => {
  const d = {};
  if (from) d.gte = toDateOnly(from);
  if (to) d.lte = toDateOnly(to);
  return Object.keys(d).length ? { [field]: d } : {};
};

/** Totals for a date range (either end optional): litres in, out, adjusted, and kg fat in/out. */
async function totals(from, to, tx = prisma) {
  const tank = await tx.silo.findUnique({ where: { name: TANK_NAME } });
  const [inn, out, adj] = await Promise.all([
    tx.milkReceipt.findMany({ where: { status: { in: ACCEPTED }, ...where('date', from, to) }, select: { supplierQtyL: true, fatPct: true } }),
    tx.batchInput.findMany({ where: { batch: { status: { not: 'CANCELLED' }, ...where('date', from, to) } }, select: { litres: true, fatPct: true } }),
    tank ? tx.siloMovement.aggregate({ where: { siloId: tank.id, type: 'ADJUSTMENT', ...where('date', from, to) }, _sum: { litres: true } }) : { _sum: { litres: 0 } },
  ]);
  const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);
  return {
    inL: sum(inn, (r) => r.supplierQtyL),
    outL: sum(out, (r) => r.litres),
    adjL: adj._sum.litres || 0,
    fatInL: sum(inn, (r) => r.supplierQtyL * (r.fatPct || 0)), // litre·% for a weighted average
    fatOutL: sum(out, (r) => r.litres * (r.fatPct || 0)),
  };
}

/** Litres in the tank at the end of `asOfIso` (or now). */
export async function tankStock(asOfIso, tx = prisma) {
  const t = await totals(null, asOfIso, tx);
  return round(t.inL - t.outL + t.adjL, 1);
}

/** One day of the tank: opening, in, out, adjustments, closing, plus the entries behind them. */
export async function tankDay(iso) {
  const prev = new Date(toDateOnly(iso));
  prev.setUTCDate(prev.getUTCDate() - 1);
  const tank = await prisma.silo.findUnique({ where: { name: TANK_NAME } });
  const [before, day, receipts, inputs, adjustments, dips] = await Promise.all([
    totals(null, isoOf(prev)),
    totals(iso, iso),
    prisma.milkReceipt.findMany({ where: { date: toDateOnly(iso), status: { in: ACCEPTED } }, include: { supplier: true }, orderBy: { id: 'asc' } }),
    prisma.batchInput.findMany({ where: { batch: { date: toDateOnly(iso), status: { not: 'CANCELLED' } } }, include: { batch: true }, orderBy: { id: 'asc' } }),
    tank ? prisma.siloMovement.findMany({ where: { siloId: tank.id, type: 'ADJUSTMENT', date: toDateOnly(iso) }, orderBy: { id: 'asc' } }) : [],
    tank ? prisma.siloDip.findMany({ where: { siloId: tank.id, date: toDateOnly(iso) }, orderBy: { id: 'desc' } }) : [],
  ]);
  const opening = round(before.inL - before.outL + before.adjL, 1);
  const closing = round(opening + day.inL - day.outL + day.adjL, 1);
  return {
    opening, closing,
    inL: round(day.inL, 1), outL: round(day.outL, 1), adjL: round(day.adjL, 1),
    fatIn: day.inL ? day.fatInL / day.inL : null,
    receipts, inputs, adjustments, dips,
  };
}
