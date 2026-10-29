// Config for the generic master-data screens. No deletes: use "Active" to retire a record.
const ACTIVE = { name: 'active', label: 'Active', type: 'checkbox', default: true };
export const PRODUCT_CATEGORIES = ['MILK', 'CURD', 'CHEESE', 'BUTTER', 'GHEE', 'CREAM', 'OTHER'];
export const STORE_CATEGORIES = ['INGREDIENT', 'PACKAGING', 'CUPS_LIDS', 'PLASTIC', 'CHEMICAL', 'LAB', 'SPARE_PARTS', 'STATIONERY', 'OTHER'];
const CAT_LABELS = { INGREDIENT: 'Ingredients', PACKAGING: 'Packaging', CUPS_LIDS: 'Cups & lids', PLASTIC: 'Plastic', CHEMICAL: 'Chemicals', LAB: 'Lab', SPARE_PARTS: 'Spare parts', STATIONERY: 'Stationery', OTHER: 'Other' };
export const catLabel = (c) => CAT_LABELS[c] || c;
export const DEPARTMENTS = ['Production', 'Packing', 'Lab / QC', 'Cleaning / CIP', 'Maintenance', 'Cold room', 'Office', 'Other'];

export const MASTERS = {
  products: {
    model: 'product',
    title: 'Products',
    subtitle: 'Each product with pack size, shelf life and crate size. Open a product to set its packaging use.',
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    detail: true,
    fields: [
      { name: 'code', label: 'Code', required: true, placeholder: 'PM500' },
      { name: 'name', label: 'Name', required: true, placeholder: 'Pasteurised milk 500 ml' },
      { name: 'category', label: 'Category', type: 'select', options: PRODUCT_CATEGORIES, default: 'MILK' },
      { name: 'unitName', label: 'Stock unit', short: 'Unit', type: 'select', options: ['packet', 'bucket', 'cup', 'litre', 'kg', 'pcs'], default: 'packet', hint: 'What the cold room counts in. Loose items: litre or kg.' },
      { name: 'litresPerUnit', label: 'Litres (or kg) per unit', short: 'Size (L/kg)', type: 'number', step: '0.001', required: true, hint: '500 ml packet = 0.5; loose milk or kg items = 1' },
      { name: 'shelfLifeDays', label: 'Shelf life (days)', short: 'Shelf life', suffix: ' days', type: 'int', required: true, default: 2 },
      { name: 'crateSize', label: 'Units per crate', short: 'Per crate', type: 'int' },
      { name: 'fatStdPct', label: 'Std fat %', type: 'number', step: '0.01' },
      { name: 'snfStdPct', label: 'Std SNF %', type: 'number', step: '0.01' },
      { name: 'sortOrder', label: 'Sort order', type: 'int', default: 0 },
      ACTIVE,
    ],
    primary: 'name',
    secondary: 'code',
    noun: 'product',
    columns: ['category', 'unitName', 'litresPerUnit', 'shelfLifeDays', 'crateSize', 'active'],
  },
  suppliers: {
    model: 'supplier',
    title: 'Suppliers & Collection Centres',
    orderBy: [{ name: 'asc' }],
    fields: [
      { name: 'name', label: 'Name', required: true },
      { name: 'type', label: 'Type', type: 'select', options: ['COLLECTION_CENTRE', 'FARMER_GROUP', 'OTHER'], default: 'COLLECTION_CENTRE' },
      { name: 'contact', label: 'Contact' },
      { name: 'address', label: 'Address' },
      ACTIVE,
    ],
    columns: ['name', 'type', 'contact', 'address', 'active'],
  },
  tankers: {
    model: 'tanker',
    title: 'Tankers',
    orderBy: [{ number: 'asc' }],
    fields: [
      { name: 'number', label: 'Tanker / vehicle no.', required: true },
      { name: 'capacityL', label: 'Capacity (L)', type: 'number' },
      { name: 'supplierId', label: 'Usual supplier', type: 'relation', model: 'supplier', labelField: 'name' },
      ACTIVE,
    ],
    columns: ['number', 'capacityL', 'supplierId', 'active'],
  },
  routes: {
    model: 'route',
    title: 'Routes',
    orderBy: [{ name: 'asc' }],
    fields: [{ name: 'name', label: 'Route name', required: true }, ACTIVE],
    columns: ['name', 'active'],
  },
  distributors: {
    model: 'distributor',
    title: 'Distributors',
    orderBy: [{ name: 'asc' }],
    fields: [
      { name: 'name', label: 'Name', required: true },
      { name: 'phone', label: 'Phone' },
      { name: 'address', label: 'Address' },
      { name: 'routeId', label: 'Route', type: 'relation', model: 'route', labelField: 'name' },
      ACTIVE,
    ],
    columns: ['name', 'phone', 'address', 'routeId', 'active'],
  },
  vehicles: {
    model: 'vehicle',
    title: 'Dispatch Vehicles',
    orderBy: [{ number: 'asc' }],
    fields: [
      { name: 'number', label: 'Vehicle no.', required: true },
      { name: 'driver', label: 'Driver' },
      { name: 'phone', label: 'Phone' },
      ACTIVE,
    ],
    columns: ['number', 'driver', 'phone', 'active'],
  },
  packaging: {
    model: 'packagingItem',
    title: 'General Store Items',
    subtitle: 'Packaging, cups & lids, plastic, chemicals, lab and other consumables. Packaging used by a product is set on the product page.',
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    fields: [
      { name: 'name', label: 'Name', required: true, placeholder: '500 ml pouch' },
      { name: 'category', label: 'Category', type: 'select', options: STORE_CATEGORIES, default: 'PACKAGING' },
      { name: 'unit', label: 'Unit', type: 'select', options: ['pcs', 'kg', 'roll', 'litre', 'box', 'packet', 'bag'], default: 'pcs' },
      { name: 'reorderLevel', label: 'Reorder level', type: 'number', step: 'any', hint: 'Flag the item as low when stock falls to this' },
      { name: 'allowedWastagePct', label: 'Allowed wastage %', short: 'Wastage %', type: 'number', step: '0.1', default: 1, hint: 'For packaging used in production' },
      ACTIVE,
    ],
    noun: 'item',
    columns: ['name', 'category', 'unit', 'reorderLevel', 'allowedWastagePct', 'active'],
  },
  'loss-reasons': {
    model: 'lossReason',
    title: 'Loss Reasons',
    orderBy: [{ appliesTo: 'asc' }, { name: 'asc' }],
    fields: [
      { name: 'name', label: 'Reason', required: true },
      { name: 'appliesTo', label: 'Used in', type: 'select', options: ['PROCESS', 'STORE', 'RETURN'], default: 'PROCESS' },
      ACTIVE,
    ],
    columns: ['name', 'appliesTo', 'active'],
  },
};

export function parseMasterForm(cfg, fd) {
  const data = {};
  for (const f of cfg.fields) {
    const raw = fd.get(f.name);
    const v = raw === null ? '' : String(raw).trim();
    if (f.type === 'checkbox') { data[f.name] = raw === 'on'; continue; }
    if (v === '') {
      if (f.required) throw new Error(`${f.label} is required`);
      data[f.name] = null;
      continue;
    }
    if (f.type === 'number') {
      const n = Number(v);
      if (Number.isNaN(n)) throw new Error(`${f.label} must be a number`);
      data[f.name] = n;
    } else if (f.type === 'int' || f.type === 'relation') {
      const n = parseInt(v, 10);
      if (Number.isNaN(n)) throw new Error(`${f.label} must be a whole number`);
      data[f.name] = n;
    } else if (f.type === 'select') {
      if (!f.options.includes(v)) throw new Error(`Invalid ${f.label}`);
      data[f.name] = v;
    } else {
      data[f.name] = v;
    }
  }
  // Non-nullable numeric defaults
  for (const f of cfg.fields) if (data[f.name] === null && f.default !== undefined && f.type !== 'relation') data[f.name] = f.default;
  if (cfg.model === 'product') {
    data.code = data.code.toUpperCase();
    if (data.litresPerUnit <= 0) throw new Error('Litres per unit must be above 0');
  }
  if (cfg.model === 'silo' && (data.correctionFactor < 0.8 || data.correctionFactor > 1.2)) throw new Error('Correction factor should be between 0.8 and 1.2');
  return data;
}
