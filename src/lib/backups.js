import { prisma } from './db';

// The nightly job runs at 02:00 Nepal time; allow a few hours of slack before warning.
export const BACKUP_MAX_AGE_HOURS = 28;

/** Latest backup runs and whether the backup is healthy. */
export async function backupStatus(take = 30) {
  const runs = await prisma.backupRun.findMany({ orderBy: { finishedAt: 'desc' }, take });
  const lastOk = runs.find((r) => r.status === 'OK') || null;
  const last = runs[0] || null;
  const ageHours = lastOk ? (Date.now() - lastOk.finishedAt.getTime()) / 36e5 : null;
  const healthy = !!lastOk && ageHours <= BACKUP_MAX_AGE_HOURS && last.status === 'OK';
  return { runs, last, lastOk, ageHours, healthy };
}

export function fmtBytes(n) {
  if (n === null || n === undefined) return '–';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}
