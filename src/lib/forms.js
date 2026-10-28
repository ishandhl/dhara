import { redirect } from 'next/navigation';

export const str = (fd, k) => {
  const v = fd.get(k);
  return v === null ? '' : String(v).trim();
};
export const optStr = (fd, k) => str(fd, k) || null;
export const optNum = (fd, k) => {
  const v = str(fd, k);
  if (v === '') return null;
  const n = Number(v);
  if (Number.isNaN(n)) throw new UserError(`"${k}" must be a number`);
  return n;
};
export const reqNum = (fd, k, label = k) => {
  const n = optNum(fd, k);
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
    if (e?.code === 'P2002') msg = 'That value already exists (must be unique)';
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
