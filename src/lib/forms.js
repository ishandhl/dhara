import { redirect } from 'next/navigation';
import { todayISO, addDays } from './dates';

export const str = (fd, k) => {
  const v = fd.get(k);
  return v === null ? '' : String(v).trim();
};
export const optStr = (fd, k) => str(fd, k) || null;
/** Number from a form field; accepts a decimal comma ("3,5") and stray spaces. */
export const optNum = (fd, k, label = k) => {
  const v = str(fd, k).replace(/\s/g, '').replace(',', '.');
  if (v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new UserError(`${label} must be a number`);
  return n;
};
export const reqNum = (fd, k, label = k) => {
  const n = optNum(fd, k, label);
  if (n === null) throw new UserError(`${label} is required`);
  return n;
};
export const reqStr = (fd, k, label = k) => {
  const v = str(fd, k);
  if (!v) throw new UserError(`${label} is required`);
  return v;
};
export const bool = (fd, k) => fd.get(k) === 'on' || fd.get(k) === 'true';

export class UserError extends Error {}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MANAGERS = ['ADMIN', 'MANAGER'];

/**
 * Entry date from a form: today if blank, never in the future, and only today or yesterday
 * unless the user is a manager (a phone date picker that slipped a month should not post into old days).
 */
export function entryDate(fd, user, key = 'date') {
  const today = todayISO();
  const date = str(fd, key) || today;
  if (!ISO.test(date)) throw new UserError('Date is not valid');
  if (date > today) throw new UserError('Date cannot be in the future');
  if (date < addDays(today, -1) && !MANAGERS.includes(user.role)) throw new UserError('Only a manager can enter a date before yesterday');
  return date;
}

/** ?date= from a page URL: a valid past or present ISO date, else today. */
export function pageDate(v) {
  const today = todayISO();
  return ISO.test(v || '') && v <= today ? v : today;
}

/**
 * Serialise competing writers inside a transaction (two taps, two phones): the second waits
 * for the first to commit, then sees its result. Keys: ['product', id], ['tank'], ['challan', id] …
 */
const LOCK_SPACE = { tank: 1, product: 2, batch: 3, challan: 4, count: 5, receipt: 6, storeEntry: 7 };
export async function lock(tx, kind, id = 0) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_SPACE[kind]}::int, ${id}::int)`;
}

/**
 * Wrap a server action: user-facing errors redirect back with ?error=...
 * The body returns a path to redirect to on success (or nothing).
 */
export async function run(backPath, fn) {
  let to;
  try {
    to = await fn();
  } catch (e) {
    if (e?.digest?.startsWith?.('NEXT_REDIRECT')) throw e;
    let msg = e instanceof UserError ? e.message : e?.message || 'Something went wrong';
    if (e?.code === 'P2002') msg = 'Someone saved the same thing at the same moment. Check the list, then try again if it is missing.';
    if (e?.code === 'P2028') msg = 'The database was busy. Please press Save again.';
    if (!(e instanceof UserError)) console.error(e);
    redirect(withParam(backPath, 'error', msg));
  }
  redirect(to || withParam(backPath, 'ok', 'Saved'));
}

export function withParam(path, k, v) {
  const [p, q] = path.split('?');
  const sp = new URLSearchParams(q || '');
  sp.delete('error');
  sp.delete('ok');
  sp.set(k, v);
  return `${p}?${sp.toString()}`;
}
