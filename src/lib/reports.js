// Period reports: milk collection, production and dispatch. Each returns totals, a per-day series and breakdowns.
import { prisma } from './db';
import { toDateOnly, isoOf, addDays, bsMonthRange } from './dates';
import { getDensity } from './tolerance';
import { batchSummary } from './batch';

const sum = (arr, f) => arr.reduce((a, x) => a + (f(x) || 0), 0);
const range = (from, to) => ({ gte: toDateOnly(from), lte: toDateOnly(to) });

export function daysOf(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Weighted fat / SNF and kg solids for a set of accepted receipts. */
function solids(list, density) {
  const L = sum(list, (r) => r.supplierQtyL);
  const fat = L ? sum(list, (r) => r.supplierQtyL * (r.fatPct || 0)) / L : null;
  const snf = L ? sum(list, (r) => r.supplierQtyL * (r.snfPct || 0)) / L : null;
  return { litres: L, fat, snf, kgFat: fat === null ? 0 : (L * density * fat) / 100, kgSnf: snf === null ? 0 : (L * density * snf) / 100 };
}

const isAccepted = (r) => r.status === 'ACCEPTED' || r.status === 'UNLOADED';

/** kg fat / SNF of one tanker (accepted tankers only). */
export function tankerSolids(t, density) {
  const ok = isAccepted(t);
  return {
    kgFat: ok && t.fatPct !== null ? (t.supplierQtyL * density * t.fatPct) / 100 : null,
    kgSnf: ok && t.snfPct !== null ? (t.supplierQtyL * density * t.snfPct) / 100 : null,
  };
}

/** BS months that overlap from..to, each cut to the period. */
export function monthsOf(from, to) {
  const out = [];
  for (let m = bsMonthRange(from, 0); m.from <= to; m = bsMonthRange(m.from, 1)) {
    out.push({ label: m.label, from: m.from < from ? from : m.from, to: m.to > to ? to : m.to });
  }
  return out;
}

/** Milk received in a period, optionally for one supplier only. */
export async function milkReport(from, to, supplierId = null) {
  const [rows, density, supplier] = await Promise.all([
    prisma.milkReceipt.findMany({ where: { date: range(from, to), status: { not: 'CANCELLED' }, ...(supplierId ? { supplierId } : {}) }, include: { supplier: true }, orderBy: [{ date: 'asc' }, { id: 'asc' }] }),
    getDensity(),
    supplierId ? prisma.supplier.findUnique({ where: { id: supplierId } }) : null,
  ]);
  const accepted = rows.filter(isAccepted);
  const rejected = rows.filter((r) => r.status === 'REJECTED');
  const adulterated = rows.filter((r) => r.adulteration && r.adulteration.toUpperCase() !== 'NONE');

  const byDay = daysOf(from, to).map((d) => {
    const day = rows.filter((r) => isoOf(r.date) === d);
    const acc = day.filter(isAccepted);
    return { date: d, tankers: day.length, rejected: day.filter((r) => r.status === 'REJECTED').length, rejectedL: sum(day.filter((r) => r.status === 'REJECTED'), (r) => r.supplierQtyL), ...solids(acc, density) };
  });

  const suppliers = new Map();
  for (const r of rows) {
    if (!suppliers.has(r.supplierId)) suppliers.set(r.supplierId, { id: r.supplierId, name: r.supplier.name, rows: [] });
    suppliers.get(r.supplierId).rows.push(r);
  }
  const bySupplier = [...suppliers.values()].map((s) => {
    const acc = s.rows.filter(isAccepted);
    return {
      id: s.id, name: s.name, tankers: s.rows.length,
      rejected: s.rows.filter((r) => r.status === 'REJECTED').length,
      adulterated: s.rows.filter((r) => r.adulteration && r.adulteration.toUpperCase() !== 'NONE').length,
      ...solids(acc, density),
    };
  }).sort((a, b) => b.litres - a.litres);

  const byMonth = monthsOf(from, to).map((m) => {
    const list = rows.filter((r) => isoOf(r.date) >= m.from && isoOf(r.date) <= m.to);
    const rej = list.filter((r) => r.status === 'REJECTED');
    return { ...m, tankers: list.length, rejected: rej.length, rejectedL: sum(rej, (r) => r.supplierQtyL), ...solids(list.filter(isAccepted), density) };
  });

  return {
    density, supplier, byDay, byMonth, bySupplier, receipts: rows,
    total: { tankers: rows.length, pending: rows.filter((r) => r.status === 'PENDING_QC').length, rejected: rejected.length, rejectedL: sum(rejected, (r) => r.supplierQtyL), adulterated: adulterated.length, ...solids(accepted, density) },
    problems: [...rejected, ...adulterated.filter((r) => r.status !== 'REJECTED')].sort((a, b) => a.date - b.date),
  };
}

export async function productionReport(from, to) {
  const [batches, density] = await Promise.all([
    prisma.batch.findMany({
      where: { date: range(from, to), status: { not: 'CANCELLED' } },
      include: { inputs: true, outputs: { include: { product: true } }, losses: true, byProducts: true, ingredients: { include: { packagingItem: true } } },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    }),
    getDensity(),
  ]);
  const closed = batches.filter((b) => b.status === 'CLOSED');
  const list = batches.map((b) => ({ ...b, s: batchSummary(b, density) }));
  const total = {
    batches: batches.length, open: batches.length - closed.length,
    milkL: sum(list, (b) => b.s.inputL), packedL: sum(list, (b) => b.s.packedL), byL: sum(list, (b) => b.s.byL),
    lossL: sum(list.filter((b) => b.status === 'CLOSED'), (b) => b.s.totalLossL),
  };
  const closedMilk = sum(list.filter((b) => b.status === 'CLOSED'), (b) => b.s.inputL);
  total.lossPct = closedMilk ? (total.lossL / closedMilk) * 100 : null;

  const products = new Map();
  for (const b of batches) for (const o of b.outputs) {
    const p = products.get(o.productId) || { name: o.product.name, unit: o.product.unitName, category: o.product.category, sort: o.product.sortOrder, units: 0, litres: 0 };
    p.units += o.units; p.litres += o.litres;
    products.set(o.productId, p);
  }
  const ingredients = new Map();
  for (const b of batches) for (const i of b.ingredients) {
    const x = ingredients.get(i.packagingItemId) || { name: i.packagingItem.name, unit: i.packagingItem.unit, qty: 0, batches: 0 };
    x.qty += i.qty; x.batches += 1;
    ingredients.set(i.packagingItemId, x);
  }
  const byProducts = new Map();
  for (const b of batches) for (const x of b.byProducts) byProducts.set(x.name, (byProducts.get(x.name) || 0) + x.litres);

  const byDay = daysOf(from, to).map((d) => {
    const day = list.filter((b) => isoOf(b.date) === d);
    return { date: d, batches: day.length, milkL: sum(day, (b) => b.s.inputL), packedL: sum(day, (b) => b.s.packedL) };
  });

  return {
    total, byDay, batches: list,
    products: [...products.values()].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)),
    ingredients: [...ingredients.values()].sort((a, b) => a.name.localeCompare(b.name)),
    byProducts: [...byProducts.entries()].map(([name, litres]) => ({ name, litres })),
  };
}

export async function dispatchReport(from, to) {
  const [challans, returns] = await Promise.all([
    prisma.challan.findMany({ where: { date: range(from, to), status: 'DISPATCHED' }, include: { distributor: { include: { route: true } }, vehicle: true, lines: { include: { product: true } } }, orderBy: [{ date: 'asc' }, { id: 'asc' }] }),
    prisma.storeEntry.findMany({ where: { date: range(from, to), kind: 'RETURN', status: 'POSTED' }, include: { product: true, distributor: true } }),
  ]);
  const lineL = (l) => l.qty * l.product.litresPerUnit;
  const retL = (r) => r.qty * r.product.litresPerUnit;

  const dist = new Map();
  const key = (d) => d?.id ?? 0;
  const get = (d) => {
    if (!dist.has(key(d))) dist.set(key(d), { name: d?.name || 'No distributor', route: d?.route?.name || '', challans: 0, litres: 0, returnedL: 0 });
    return dist.get(key(d));
  };
  for (const c of challans) { const x = get(c.distributor); x.challans += 1; x.litres += sum(c.lines, lineL); }
  for (const r of returns) get(r.distributor).returnedL += retL(r);
  const byDistributor = [...dist.values()].map((x) => ({ ...x, returnPct: x.litres ? (x.returnedL / x.litres) * 100 : null })).sort((a, b) => b.litres - a.litres);

  const prod = new Map();
  const pget = (p) => {
    if (!prod.has(p.id)) prod.set(p.id, { name: p.name, unit: p.unitName, sort: p.sortOrder, units: 0, litres: 0, returned: 0, returnedL: 0 });
    return prod.get(p.id);
  };
  for (const c of challans) for (const l of c.lines) { const x = pget(l.product); x.units += l.qty; x.litres += lineL(l); }
  for (const r of returns) { const x = pget(r.product); x.returned += r.qty; x.returnedL += retL(r); }
  const byProduct = [...prod.values()].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));

  const byDay = daysOf(from, to).map((d) => ({
    date: d,
    challans: challans.filter((c) => isoOf(c.date) === d).length,
    litres: sum(challans.filter((c) => isoOf(c.date) === d), (c) => sum(c.lines, lineL)),
    returnedL: sum(returns.filter((r) => isoOf(r.date) === d), retL),
  }));

  const litres = sum(byDay, (d) => d.litres);
  const returnedL = sum(byDay, (d) => d.returnedL);
  return {
    byDay, byDistributor, byProduct, challans,
    total: { challans: challans.length, distributors: byDistributor.filter((d) => d.challans).length, litres, returnedL, returnPct: litres ? (returnedL / litres) * 100 : null },
  };
}
