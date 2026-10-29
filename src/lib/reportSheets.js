// Excel layout of the milk, production and dispatch reports (same numbers as the screens).
import { currentUser } from './auth';
import { canView } from './roles';
import { bs } from './dates';
import { readPeriod } from './period';
import { round } from './format';
import { tableWorkbook } from './excel';
import { milkReport, productionReport, dispatchReport } from './reports';

const r1 = (v) => (v === null || v === undefined ? null : round(v, 1));
const r2 = (v) => (v === null || v === undefined ? null : round(v, 2));
const periodName = (from, to) => (from === to ? bs(from) : `${bs(from)} to ${bs(to)}`);

const MILK_DAY = [
  { key: 'date', header: 'Date (BS)', width: 12 }, { key: 'tankers', header: 'Tankers', width: 9 },
  { key: 'litres', header: 'Milk accepted (L)', width: 14, fill: '92D050' }, { key: 'fat', header: 'Avg fat %', width: 10 },
  { key: 'snf', header: 'Avg SNF %', width: 10 }, { key: 'kgFat', header: 'kg fat', width: 10 }, { key: 'kgSnf', header: 'kg SNF', width: 10 },
  { key: 'rejected', header: 'Rejected tankers', width: 11, fill: 'F8CBAD' }, { key: 'rejectedL', header: 'Rejected (L)', width: 12, fill: 'F8CBAD' },
];
const MILK_SUP = [
  { key: 'name', header: 'Supplier', width: 30 }, { key: 'tankers', header: 'Tankers', width: 9 },
  { key: 'litres', header: 'Milk accepted (L)', width: 14, fill: '92D050' }, { key: 'fat', header: 'Avg fat %', width: 10 },
  { key: 'snf', header: 'Avg SNF %', width: 10 }, { key: 'kgFat', header: 'kg fat', width: 10 }, { key: 'kgSnf', header: 'kg SNF', width: 10 },
  { key: 'rejected', header: 'Rejected', width: 10, fill: 'F8CBAD' }, { key: 'adulterated', header: 'Adulteration found', width: 12, fill: 'FFFF00' },
];
const solidsRow = (x) => ({ litres: r1(x.litres), fat: r2(x.fat), snf: r2(x.snf), kgFat: r1(x.kgFat), kgSnf: r1(x.kgSnf) });

export async function milkSheets(from, to) {
  const r = await milkReport(from, to);
  const days = r.byDay.filter((d) => d.tankers).map((d) => ({ date: bs(d.date), tankers: d.tankers, ...solidsRow(d), rejected: d.rejected || null, rejectedL: d.rejectedL || null }));
  days.push({ date: 'TOTAL', tankers: r.total.tankers, ...solidsRow(r.total), rejected: r.total.rejected, rejectedL: r1(r.total.rejectedL), bold: true });
  const sups = r.bySupplier.map((s) => ({ name: s.name, tankers: s.tankers, ...solidsRow(s), rejected: s.rejected || null, adulterated: s.adulterated || null }));
  return [
    { name: 'By day', title: `Milk collection ${periodName(from, to)}`, columns: MILK_DAY, rows: days },
    { name: 'By supplier', title: `Milk collection by supplier ${periodName(from, to)}`, columns: MILK_SUP, rows: sups },
  ];
}

export async function productionSheets(from, to) {
  const r = await productionReport(from, to);
  return [
    {
      name: 'Products packed', title: `Production ${periodName(from, to)}`,
      columns: [{ key: 'name', header: 'Product', width: 36 }, { key: 'unit', header: 'Unit', width: 9 }, { key: 'units', header: 'Quantity', width: 12, fill: '92D050' }, { key: 'litres', header: 'Litres / kg', width: 12 }],
      rows: [...r.products.map((p) => ({ name: p.name, unit: p.unit, units: r1(p.units), litres: r1(p.litres) })), { name: 'TOTAL', litres: r1(r.total.packedL), bold: true }],
    },
    {
      name: 'Batches', title: `Production batches ${periodName(from, to)}`,
      columns: [{ key: 'batchNo', header: 'Batch', width: 14 }, { key: 'date', header: 'Date (BS)', width: 12 }, { key: 'status', header: 'Status', width: 9 }, { key: 'milkL', header: 'Milk in (L)', width: 12 }, { key: 'packedL', header: 'Packed (L)', width: 12, fill: '92D050' }, { key: 'byL', header: 'By-products (L)', width: 13 }, { key: 'lossL', header: 'Loss (L)', width: 10, fill: 'F8CBAD' }, { key: 'lossPct', header: 'Loss %', width: 9, fill: 'F8CBAD' }],
      rows: r.batches.map((b) => ({ batchNo: b.batchNo, date: bs(b.date), status: b.status, milkL: r1(b.s.inputL), packedL: r1(b.s.packedL), byL: b.s.byL || null, lossL: b.status === 'CLOSED' ? r1(b.s.totalLossL) : null, lossPct: b.status === 'CLOSED' ? r2(b.s.totalLossPct) : null })),
    },
    {
      name: 'Ingredients', title: `Ingredients added ${periodName(from, to)}`,
      columns: [{ key: 'name', header: 'Ingredient', width: 30 }, { key: 'unit', header: 'Unit', width: 9 }, { key: 'qty', header: 'Quantity used', width: 14, fill: 'FFFF00' }, { key: 'batches', header: 'Batches', width: 10 }],
      rows: r.ingredients.map((i) => ({ ...i, qty: r2(i.qty) })),
    },
  ];
}

export async function dispatchSheets(from, to) {
  const r = await dispatchReport(from, to);
  return [
    {
      name: 'By distributor', title: `Market going by distributor ${periodName(from, to)}`,
      columns: [{ key: 'name', header: 'Distributor', width: 30 }, { key: 'route', header: 'Route', width: 16 }, { key: 'challans', header: 'Challans', width: 10 }, { key: 'litres', header: 'Market going (L)', width: 14, fill: '92D050' }, { key: 'returnedL', header: 'Market return (L)', width: 14, fill: 'F8CBAD' }, { key: 'returnPct', header: 'Return %', width: 10, fill: 'F8CBAD' }],
      rows: [...r.byDistributor.map((d) => ({ ...d, litres: r1(d.litres), returnedL: r1(d.returnedL) || null, returnPct: r2(d.returnPct) })), { name: 'TOTAL', challans: r.total.challans, litres: r1(r.total.litres), returnedL: r1(r.total.returnedL), returnPct: r2(r.total.returnPct), bold: true }],
    },
    {
      name: 'By product', title: `Market going by product ${periodName(from, to)}`,
      columns: [{ key: 'name', header: 'Product', width: 36 }, { key: 'unit', header: 'Unit', width: 9 }, { key: 'units', header: 'Market going', width: 13, fill: '92D050' }, { key: 'litres', header: 'Going (L)', width: 11 }, { key: 'returned', header: 'Market return', width: 13, fill: 'F8CBAD' }, { key: 'returnedL', header: 'Return (L)', width: 11 }],
      rows: r.byProduct.map((p) => ({ ...p, units: r1(p.units), litres: r1(p.litres), returned: r1(p.returned) || null, returnedL: r1(p.returnedL) || null })),
    },
  ];
}

/** GET handler body shared by the three Excel routes. */
export async function excelDownload(req, title, build) {
  const user = await currentUser();
  if (!user || !canView(user.role, 'reports')) return new Response('Not allowed', { status: 403 });
  const { from, to } = readPeriod(Object.fromEntries(req.nextUrl.searchParams));
  const buf = await tableWorkbook(await build(from, to));
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${title} ${periodName(from, to)}.xlsx"`,
    },
  });
}
