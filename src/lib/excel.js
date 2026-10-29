import ExcelJS from 'exceljs';
import { bs } from './dates';
import { catLabel } from './masters';
import { BRAND } from './brand';

// Same column colours as the plant's "Coldroom Record" workbook.
export const COLDROOM_COLUMNS = [
  { key: 'date', header: 'Date', width: 12 },
  { key: 'name', header: 'NAME OF PRODUCT', width: 36 },
  { key: 'unit', header: 'Unit', width: 8 },
  { key: 'opening', header: 'OPENING BALANCE', width: 12, fill: '92D050' },
  { key: 'production', header: "Today's collection/ Production", width: 14 },
  { key: 'going', header: 'Market Going', width: 11 },
  { key: 'returned', header: 'Market Return', width: 11, fill: 'F8CBAD' },
  { key: 'damage', header: 'Used/ Damage', width: 11, fill: 'FFFF00' },
  { key: 'adjust', header: 'Count Adj.', width: 10 },
  { key: 'stock', header: 'Stock', width: 12, fill: '70AD47' },
  { key: 'count', header: 'Count Record of Coldroom', width: 13, fill: '00B0F0' },
  { key: 'diff', header: 'Different', width: 11, fill: 'F4B084' },
  { key: 'remark', header: 'Remarks', width: 24, fill: 'A9D08E' },
];

const thin = { style: 'thin', color: { argb: 'FF999999' } };
const border = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (hex) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hex}` } });

function addTable(ws, title, columns, rows, freezeCols = 2) {
  ws.columns = columns.map((c) => ({ key: c.key, width: c.width }));
  ws.addRow([title]).font = { bold: true, size: 13 };
  ws.mergeCells(1, 1, 1, columns.length);
  const head = ws.addRow(columns.map((c) => c.header));
  head.height = 32;
  head.eachCell((cell, i) => {
    const c = columns[i - 1];
    cell.font = { bold: true };
    cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
    cell.border = border;
    if (c.fill) cell.fill = fill(c.fill);
  });
  for (const r of rows) {
    const row = ws.addRow(columns.map((c) => r[c.key] ?? null));
    row.eachCell({ includeEmpty: true }, (cell, i) => {
      const c = columns[i - 1];
      cell.border = border;
      if (c.fill && c.key !== 'remark') cell.fill = fill(c.fill);
      if (typeof cell.value === 'number') cell.numFmt = '#,##0.##';
    });
    if (r.highlight) row.getCell('diff').font = { bold: true, color: { argb: 'FFC00000' } };
    if (r.bold) row.font = { bold: true };
  }
  ws.views = [{ state: 'frozen', xSplit: freezeCols, ySplit: 2 }];
}

/** Workbook with one styled table per sheet: [{ name, title, columns, rows }]. Rows with `bold` are totals. */
export async function tableWorkbook(sheets) {
  const wb = new ExcelJS.Workbook();
  wb.creator = BRAND.name;
  for (const s of sheets) addTable(wb.addWorksheet(s.name.slice(0, 31)), s.title, s.columns, s.rows, 1);
  return wb.xlsx.writeBuffer();
}

const blankZero = (v) => (v ? v : 0);

function coldroomRows(register, dateIso) {
  return register.map((r) => ({
    date: bs(dateIso),
    name: r.product.name,
    unit: r.product.unitName,
    opening: blankZero(r.opening),
    production: blankZero(r.production),
    going: r.going || null,
    returned: r.returned || null,
    damage: r.damage || null,
    adjust: r.adjust || null,
    stock: blankZero(r.stock),
    count: r.count,
    diff: r.diff,
    remark: r.remark,
    highlight: r.diff !== null && Math.abs(r.diff) > 0.0001,
  }));
}

/** Workbook: one summary sheet for the period, plus one sheet per day like the Excel record. */
export async function coldroomWorkbook({ from, to, summary, days }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = BRAND.name;
  const title = from === to ? `Coldroom Record ${bs(from)}` : `Coldroom Record ${bs(from)} to ${bs(to)}`;
  addTable(wb.addWorksheet(from === to ? bs(from) : 'Period summary'), title, COLDROOM_COLUMNS, coldroomRows(summary, to));
  if (from !== to) for (const d of days) addTable(wb.addWorksheet(bs(d.date)), `Coldroom Record ${bs(d.date)}`, COLDROOM_COLUMNS, coldroomRows(d.register, d.date));
  return wb.xlsx.writeBuffer();
}

export const STORE_COLUMNS = [
  { key: 'category', header: 'Category', width: 14 },
  { key: 'name', header: 'Item', width: 32 },
  { key: 'unit', header: 'Unit', width: 8 },
  { key: 'opening', header: 'Opening', width: 12, fill: '92D050' },
  { key: 'received', header: 'Received', width: 12 },
  { key: 'issued', header: 'Issued / Used', width: 12, fill: 'FFFF00' },
  { key: 'adjust', header: 'Count Adj.', width: 11 },
  { key: 'closing', header: 'Closing', width: 12, fill: '70AD47' },
  { key: 'reorder', header: 'Reorder level', width: 12 },
  { key: 'remark', header: 'Remarks', width: 16, fill: 'A9D08E' },
];

export async function generalStoreWorkbook({ from, to, register }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = BRAND.name;
  const rows = register.map((r) => ({
    category: catLabel(r.item.category), name: r.item.name, unit: r.item.unit,
    opening: r.opening, received: r.received || null, issued: r.issued || null, adjust: r.adjust || null, closing: r.closing,
    reorder: r.item.reorderLevel, remark: r.low ? 'LOW - reorder' : '',
  }));
  addTable(wb.addWorksheet('General store'), `General Store ${bs(from)}${from === to ? '' : ` to ${bs(to)}`}`, STORE_COLUMNS, rows);
  return wb.xlsx.writeBuffer();
}
