import { todayISO } from './dates';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** from / to from search params: defaults to today, swaps if reversed, never in the future. */
export function readPeriod(sp) {
  const today = todayISO();
  let to = ISO.test(sp?.to || '') ? sp.to : today;
  let from = ISO.test(sp?.from || '') ? sp.from : to;
  if (to > today) to = today;
  if (from > to) [from, to] = [to, from];
  return { from, to };
}
