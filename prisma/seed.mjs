// Seeds starter data. Safe to run more than once (skips what already exists).
//   npm run db:seed            → admin user, loss reasons, tolerances, products, general store items, sample suppliers
//   npm run db:seed -- --demo  → also one demo user per role (password: dairy123) and one demo cold room day
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const demo = process.argv.includes('--demo');
// --production: live database. Admin password comes from ADMIN_PASSWORD; no sample suppliers.
const production = process.argv.includes('--production');

async function main() {
  if (production && demo) throw new Error('Use either --production or --demo, not both');
  // Admin
  if (!(await prisma.user.findUnique({ where: { username: 'admin' } }))) {
    const password = production ? process.env.ADMIN_PASSWORD : 'admin123';
    if (production && (!password || password.length < 10)) throw new Error('Set ADMIN_PASSWORD (at least 10 characters) for --production');
    await prisma.user.create({ data: { name: 'Owner', username: 'admin', role: 'ADMIN', passwordHash: await bcrypt.hash(password, 10) } });
    console.log(production ? 'Created admin with the password from ADMIN_PASSWORD' : 'Created admin / admin123  ← change this password after first login');
  }
  if (demo) {
    const people = [
      ['Plant Manager', 'manager', 'MANAGER'],
      ['Ram (QC)', 'qc', 'QC'],
      ['Sita (Production)', 'production', 'PRODUCTION'],
      ['Hari (Store)', 'store', 'STORE'],
      ['Gopal (Dispatch)', 'dispatch', 'DISPATCH'],
      ['Accounts', 'accounts', 'ACCOUNTS'],
    ];
    const hash = await bcrypt.hash('dairy123', 10);
    for (const [name, username, role] of people) {
      await prisma.user.upsert({ where: { username }, create: { name, username, role, passwordHash: hash }, update: {} });
    }
    console.log('Demo users: manager, qc, production, store, dispatch, accounts (password dairy123)');
  }

  // Settings & tolerances
  await prisma.setting.upsert({ where: { key: 'MILK_DENSITY' }, create: { key: 'MILK_DENSITY', value: '1.030' }, update: {} });
  const tols = [
    ['PRODUCTION_LOSS', 'Production unexplained loss', 1, 2],
    ['FG_SHORTAGE', 'Finished goods shortage', 0, 0.2],
    ['PACKAGING_WASTAGE', 'Packaging wastage', 1, 3],
  ];
  for (const [key, label, greenPct, amberPct] of tols) {
    await prisma.tolerance.upsert({ where: { key }, create: { key, label, greenPct, amberPct }, update: {} });
  }

  // Loss reasons
  const reasons = {
    PROCESS: ['Spillage', 'Line flushing / purge', 'Leakage', 'CIP rinse', 'Lab sample', 'Pouch burst on machine'],
    STORE: ['Damaged', 'Leaking', 'Expired', 'Used in production', 'Sample / internal use'],
    RETURN: ['Unsold', 'Leaking', 'Expired', 'Short delivered'],
  };
  for (const [appliesTo, names] of Object.entries(reasons)) {
    for (const name of names) {
      await prisma.lossReason.upsert({ where: { name_appliesTo: { name, appliesTo } }, create: { name, appliesTo }, update: {} });
    }
  }

  // Products as in the Coldroom Record sheet — edit in Masters → Products.
  // [code, name, category, stock unit, litres or kg per unit, shelf life days]
  const products = [
    ['WML42', 'Whole Milk Loose (4.2 Fat)', 'MILK', 'litre', 1, 2],
    ['WMPKT', 'Whole Milk (Packet)', 'MILK', 'litre', 1, 2],
    ['WML51', 'Whole Milk Loose (5.1 Fat)', 'MILK', 'litre', 1, 2],
    ['SML', 'Standard Milk Loose', 'MILK', 'litre', 1, 2],
    ['SMPKT', 'Standard Milk (Packet)', 'MILK', 'litre', 1, 2],
    ['COW', 'Cow Milk', 'MILK', 'litre', 1, 2],
    ['SC20P', 'Special Curd 20 Ltr (Printed Bucket)', 'CURD', 'litre', 1, 7],
    ['SC10P', 'Special Curd 10 Ltr (Printed Bucket)', 'CURD', 'litre', 1, 7],
    ['SC20', 'Special Curd 20 Ltr (Plain Bucket)', 'CURD', 'litre', 1, 7],
    ['SWC1', 'Sweet Curd 1 Ltr', 'CURD', 'pcs', 1, 7],
    ['SWC05', 'Sweet Curd 0.5 Ltr', 'CURD', 'pcs', 0.5, 7],
    ['CUP200', 'Cup 200 ml', 'CURD', 'cup', 0.2, 7],
    ['CUP125', 'Cup 125 ml', 'CURD', 'cup', 0.125, 7],
    ['PC20P', 'Plain Curd 20 Ltr (Printed Bucket)', 'CURD', 'litre', 1, 7],
    ['PC10P', 'Plain Curd 10 Ltr (Printed Bucket)', 'CURD', 'litre', 1, 7],
    ['PC20', 'Plain Curd 20 Ltr (Plain Bucket)', 'CURD', 'litre', 1, 7],
    ['JJD1', 'Ju Ju Dhau 1 Ltr', 'CURD', 'pcs', 1, 7],
    ['JJD05', 'Ju Ju Dhau 0.5 Ltr', 'CURD', 'pcs', 0.5, 7],
    ['CTGC', 'Cottage Cheese', 'CHEESE', 'kg', 1, 30],
    ['KCHC', 'Kanchan Cheese', 'CHEESE', 'kg', 1, 90],
    ['MOZC', 'Mozzarella Cheese', 'CHEESE', 'kg', 1, 60],
    ['KHUWA', 'Khuwa', 'OTHER', 'kg', 1, 10],
    ['CREAM', 'Cream', 'CREAM', 'litre', 1, 5],
    ['BTRL', 'Butter Loose', 'BUTTER', 'kg', 1, 90],
    ['TB500', 'Table Butter 500 gm', 'BUTTER', 'pcs', 0.5, 90],
    ['TB200', 'Table Butter 200 gm', 'BUTTER', 'pcs', 0.2, 90],
    ['TB100', 'Table Butter 100 gm', 'BUTTER', 'pcs', 0.1, 90],
    ['GH1', 'Ghee 1 Ltr', 'GHEE', 'pcs', 1, 365],
    ['GH05', 'Ghee 0.5 Ltr', 'GHEE', 'pcs', 0.5, 365],
    ['GH02', 'Ghee 0.2 Ltr', 'GHEE', 'pcs', 0.2, 365],
    ['GHL', 'Ghee Loose', 'GHEE', 'litre', 1, 365],
    ['CGH05', 'Cow Ghee 0.5 Ltr', 'GHEE', 'pcs', 0.5, 365],
    ['CGH02', 'Cow Ghee 0.2 Ltr', 'GHEE', 'pcs', 0.2, 365],
    ['MOHI', 'Mohi', 'OTHER', 'litre', 1, 2],
    ['COWB', 'Cow Butter', 'BUTTER', 'kg', 1, 90],
  ];
  if ((await prisma.product.count()) === 0) {
    let sortOrder = 0;
    for (const [code, name, category, unitName, litresPerUnit, shelfLifeDays] of products) {
      await prisma.product.create({ data: { code, name, category, unitName, litresPerUnit, shelfLifeDays, sortOrder: ++sortOrder } });
    }
    console.log(`${products.length} products created (from the Coldroom Record sheet)`);
  }

  // General store items: [name, category, unit, reorder level]
  const items = [
    ['Milk pouch film', 'PACKAGING', 'kg', 50], ['Printed bucket 20 L', 'PACKAGING', 'pcs', 100], ['Printed bucket 10 L', 'PACKAGING', 'pcs', 50],
    ['Plain bucket 20 L', 'PACKAGING', 'pcs', 50], ['Butter wrapper', 'PACKAGING', 'pcs', 300], ['Ghee jar 1 L', 'PACKAGING', 'pcs', 50],
    ['Ghee jar 0.5 L', 'PACKAGING', 'pcs', 50], ['Ghee jar 0.2 L', 'PACKAGING', 'pcs', 50], ['Carton box', 'PACKAGING', 'pcs', 100],
    ['Curd cup 200 ml', 'CUPS_LIDS', 'pcs', 2000], ['Curd cup 125 ml', 'CUPS_LIDS', 'pcs', 2000], ['Cup lid / foil', 'CUPS_LIDS', 'pcs', 3000],
    ['Sweet curd cup 1 L', 'CUPS_LIDS', 'pcs', 300], ['Sweet curd cup 0.5 L', 'CUPS_LIDS', 'pcs', 300], ['Dhau pot 1 L', 'CUPS_LIDS', 'pcs', 100], ['Dhau pot 0.5 L', 'CUPS_LIDS', 'pcs', 100],
    ['Plastic crate', 'PLASTIC', 'pcs', 20], ['Polythene bag', 'PLASTIC', 'kg', 10], ['Stretch film', 'PLASTIC', 'roll', 5], ['Packing tape', 'PLASTIC', 'roll', 10],
    ['Caustic soda', 'CHEMICAL', 'kg', 50], ['Nitric acid', 'CHEMICAL', 'litre', 20], ['Detergent', 'CHEMICAL', 'kg', 20], ['Chlorine sanitizer', 'CHEMICAL', 'litre', 10],
    ['Curd culture', 'CHEMICAL', 'packet', 10], ['Rennet', 'CHEMICAL', 'packet', 5],
    ['Sulphuric acid (lab)', 'LAB', 'litre', 2], ['Amyl alcohol', 'LAB', 'litre', 1], ['Butyrometer', 'LAB', 'pcs', 5],
    ['Pump seal', 'SPARE_PARTS', 'pcs', 2], ['Gasket', 'SPARE_PARTS', 'pcs', 5],
    ['Challan book', 'STATIONERY', 'pcs', 5], ['Printer paper', 'STATIONERY', 'packet', 2],
  ];
  // Ingredients added to milk in production — added on every run so existing databases get them too.
  for (const [name, unit, reorderLevel] of [['Skim milk powder (SMP)', 'kg', 50], ['Whole milk powder (WMP)', 'kg', 25], ['Sugar', 'kg', 50], ['Stabiliser', 'kg', 5]]) {
    await prisma.packagingItem.upsert({ where: { name }, create: { name, category: 'INGREDIENT', unit, reorderLevel }, update: {} });
  }
  if ((await prisma.packagingItem.count({ where: { category: { not: 'INGREDIENT' } } })) === 0) {
    for (const [name, category, unit, reorderLevel] of items) await prisma.packagingItem.create({ data: { name, category, unit, reorderLevel } });
    // Packaging each product uses (bill of materials) — compared with actual use in production batches.
    const bom = [
      ['CUP200', 'Curd cup 200 ml', 1], ['CUP200', 'Cup lid / foil', 1], ['CUP125', 'Curd cup 125 ml', 1], ['CUP125', 'Cup lid / foil', 1],
      ['SWC1', 'Sweet curd cup 1 L', 1], ['SWC05', 'Sweet curd cup 0.5 L', 1], ['JJD1', 'Dhau pot 1 L', 1], ['JJD05', 'Dhau pot 0.5 L', 1],
      ['GH1', 'Ghee jar 1 L', 1], ['GH05', 'Ghee jar 0.5 L', 1], ['GH02', 'Ghee jar 0.2 L', 1], ['CGH05', 'Ghee jar 0.5 L', 1], ['CGH02', 'Ghee jar 0.2 L', 1],
      ['TB500', 'Butter wrapper', 1], ['TB200', 'Butter wrapper', 1], ['TB100', 'Butter wrapper', 1],
      ['SC20P', 'Printed bucket 20 L', 0.05], ['PC20P', 'Printed bucket 20 L', 0.05], ['SC10P', 'Printed bucket 10 L', 0.1], ['PC10P', 'Printed bucket 10 L', 0.1],
      ['SC20', 'Plain bucket 20 L', 0.05], ['PC20', 'Plain bucket 20 L', 0.05],
    ];
    for (const [code, itemName, qtyPerUnit] of bom) {
      const p = await prisma.product.findUnique({ where: { code } });
      const i = await prisma.packagingItem.findUnique({ where: { name: itemName } });
      if (p && i) await prisma.productPackaging.create({ data: { productId: p.id, packagingItemId: i.id, qtyPerUnit } });
    }
    console.log(`${items.length} general store items created`);
  }

  if (!production && (await prisma.supplier.count()) === 0) {
    for (const name of ['Sample Collection Centre A', 'Sample Collection Centre B']) await prisma.supplier.create({ data: { name } });
  }

  if (demo && (await prisma.stockLedger.count()) === 0) await demoDay();
}

const dateOnly = (offsetDays) => {
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
};

// One day of cold room activity using the figures from the Coldroom Record sheet,
// so the report can be compared with the Excel file.
async function demoDay() {
  const admin = await prisma.user.findUnique({ where: { username: 'admin' } });
  const by = admin.id;
  const yesterday = dateOnly(-1);
  const today = dateOnly(0);
  const p = Object.fromEntries((await prisma.product.findMany()).map((x) => [x.code, x]));

  const route = await prisma.route.create({ data: { name: 'Kathmandu Valley' } });
  const dist = await prisma.distributor.create({ data: { name: 'Sample Distributor', routeId: route.id } });
  await prisma.distributor.create({ data: { name: 'Sample Retail Counter', routeId: route.id } });
  const veh = await prisma.vehicle.create({ data: { number: 'Ba 2 Ja 1234', driver: 'Sample driver' } });

  // Opening balances (column C). Whole Milk Loose 4.2 is −70,765 in the sheet; stock cannot be negative, so it starts at 0.
  const opening = { WMPKT: 1076, WML51: 420, SML: 1940, SMPKT: 66607, COW: 745, SC20P: 1633.7, SC10P: 360, SC20: 940, SWC1: 323, SWC05: 512, CUP200: 340, CUP125: 111, PC20P: 2834, PC10P: 1080, PC20: 380, JJD1: 27, JJD05: 34, CTGC: 354.3, KCHC: 38.3, MOZC: 12.7, KHUWA: 40.7, CREAM: 513, BTRL: 1240, TB500: 42, TB200: 88, TB100: 60, GH1: 64, GH05: 129, GH02: 45, GHL: 50, COWB: 7.5 };
  for (const [code, qty] of Object.entries(opening)) {
    const e = await prisma.storeEntry.create({ data: { date: yesterday, kind: 'OPENING', productId: p[code].id, qty, note: 'From Coldroom Record sheet', createdById: by } });
    await prisma.stockLedger.create({ data: { date: yesterday, productId: p[code].id, batchNo: 'OPENING', type: 'OPENING', qtyUnits: qty, refType: 'StoreEntry', refId: e.id, createdById: by } });
  }
  // Today's collection / production (column D)
  const made = { WML42: 1260, SML: 350, SMPKT: 9360, SC20P: 330, SC20: 1980, SWC1: 100, SWC05: 100, CUP200: 45, PC20P: 1030, JJD1: 45, KHUWA: 11.9, CREAM: 210, BTRL: 121, GH1: 14, GH05: 157 };
  for (const [code, qty] of Object.entries(made)) {
    const pr = p[code];
    const expiry = new Date(today); expiry.setUTCDate(expiry.getUTCDate() + pr.shelfLifeDays);
    const e = await prisma.storeEntry.create({ data: { date: today, kind: 'RECEIPT', productId: pr.id, qty, createdById: by } });
    await prisma.stockLedger.create({ data: { date: today, productId: pr.id, batchNo: 'DEMO-01', expiryDate: expiry, type: 'RECEIPT_IN', qtyUnits: qty, refType: 'StoreEntry', refId: e.id, createdById: by } });
  }
  // Used / damage (column G): cream used for butter
  const reason = await prisma.lossReason.findUnique({ where: { name_appliesTo: { name: 'Used in production', appliesTo: 'STORE' } } });
  const used = await prisma.storeEntry.create({ data: { date: today, kind: 'DAMAGE', productId: p.CREAM.id, qty: 135, reasonId: reason.id, createdById: by } });
  await prisma.stockLedger.create({ data: { date: today, productId: p.CREAM.id, batchNo: 'OPENING', type: 'DAMAGE', qtyUnits: -135, refType: 'StoreEntry', refId: used.id, note: reason.name, createdById: by } });

  // A dispatched challan (Market Going)
  const c = await prisma.challan.create({ data: { challanNo: 'DEMO-01', date: today, status: 'DISPATCHED', dispatchedAt: new Date(), distributorId: dist.id, vehicleId: veh.id, createdById: by } });
  for (const [code, qty] of Object.entries({ SMPKT: 8000, PC20P: 900, CUP200: 200, GH05: 60 })) {
    await prisma.challanLine.create({ data: { challanId: c.id, productId: p[code].id, qty } });
    await prisma.stockLedger.create({ data: { date: today, productId: p[code].id, batchNo: 'OPENING', type: 'DISPATCH_OUT', qtyUnits: -qty, refType: 'Challan', refId: c.id, note: 'Challan DEMO-01', createdById: by } });
  }
  // A market return
  const ret = await prisma.storeEntry.create({ data: { date: today, kind: 'RETURN', productId: p.SMPKT.id, qty: 120, distributorId: dist.id, createdById: by } });
  await prisma.stockLedger.create({ data: { date: today, productId: p.SMPKT.id, batchNo: 'RETURN', type: 'RETURN_IN', qtyUnits: 120, refType: 'StoreEntry', refId: ret.id, createdById: by } });

  // General store opening stock, with a couple of items below their reorder level
  const stock = { 'Curd cup 200 ml': 6000, 'Curd cup 125 ml': 1500, 'Cup lid / foil': 9000, 'Caustic soda': 120, 'Nitric acid': 15, 'Printed bucket 20 L': 400, 'Plastic crate': 150, 'Polythene bag': 25, 'Detergent': 40 };
  for (const [name, qty] of Object.entries(stock)) {
    const i = await prisma.packagingItem.findUnique({ where: { name } });
    await prisma.packagingLedger.create({ data: { date: yesterday, packagingItemId: i.id, type: 'OPENING', qty, createdById: by } });
  }
  const caustic = await prisma.packagingItem.findUnique({ where: { name: 'Caustic soda' } });
  await prisma.packagingLedger.create({ data: { date: today, packagingItemId: caustic.id, type: 'ISSUE', qty: -25, party: 'Cleaning / CIP', createdById: by } });
  console.log('Demo cold room day created (opening + production + dispatch + return + used) and general store stock');
}

main().finally(() => prisma.$disconnect());
