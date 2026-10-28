import NepaliDateMod from 'nepali-date-converter';

const NepaliDate = NepaliDateMod.default || NepaliDateMod;
export const TZ = 'Asia/Kathmandu';

/** Today's business date in Nepal as 'YYYY-MM-DD' (AD). */
export function todayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** 'YYYY-MM-DD' → Date at UTC midnight (how Postgres DATE columns round-trip through Prisma). */
export function toDateOnly(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) throw new Error('Invalid date');
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Date (DATE column) or ISO string → 'YYYY-MM-DD'. */
export function isoOf(d) {
  if (!d) return '';
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

export function addDays(iso, n) {
  const d = toDateOnly(isoOf(iso));
  d.setUTCDate(d.getUTCDate() + n);
  return isoOf(d);
}

function nepali(iso) {
  const [y, m, d] = isoOf(iso).split('-').map(Number);
  return new NepaliDate(new Date(y, m - 1, d, 12));
}

/** AD date → BS 'YYYY-MM-DD'. */
export function bs(iso) {
  if (!iso) return '';
  try { return nepali(iso).format('YYYY-MM-DD'); } catch { return ''; }
}

/** AD date → BS 'YYMMDD', used in batch and receipt numbers. */
export function bsCompact(iso) {
  return bs(iso).replaceAll('-', '').slice(2);
}

/** Display both calendars: '2083-07-08 (25 Oct 2026)'. */
export function fmtDate(iso) {
  if (!iso) return '';
  const ad = isoOf(iso);
  const [y, m, d] = ad.split('-').map(Number);
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];
  return `${bs(ad)} BS (${d} ${mon} ${y})`;
}

export function fmtTime(dt) {
  if (!dt) return '';
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(dt));
}

export function fmtDateTime(dt) {
  if (!dt) return '';
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(dt));
  return `${bs(iso)} ${fmtTime(dt)}`;
}
