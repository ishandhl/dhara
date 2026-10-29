import { prisma } from './db';
import { DEFAULT_SNF_FORMULA } from './snf';

export const DEFAULT_TOLERANCES = [
  { key: 'PRODUCTION_LOSS', label: 'Production unexplained loss', greenPct: 1, amberPct: 2 },
  { key: 'FG_SHORTAGE', label: 'Finished goods shortage', greenPct: 0, amberPct: 0.2 },
  { key: 'PACKAGING_WASTAGE', label: 'Packaging wastage', greenPct: 1, amberPct: 3 },
];

export async function getTolerances() {
  const rows = await prisma.tolerance.findMany();
  const map = Object.fromEntries(DEFAULT_TOLERANCES.map((t) => [t.key, t]));
  for (const r of rows) map[r.key] = r;
  return map;
}

/** abs(pct) → 'green' | 'amber' | 'red' */
export function flag(pctValue, tol) {
  if (pctValue === null || pctValue === undefined || !tol) return null;
  const a = Math.abs(pctValue);
  if (a <= tol.greenPct) return 'green';
  if (a <= tol.amberPct) return 'amber';
  return 'red';
}

export async function getSetting(key, fallback) {
  const s = await prisma.setting.findUnique({ where: { key } });
  return s ? s.value : fallback;
}
export async function getDensity() {
  return Number(await getSetting('MILK_DENSITY', '1.030')) || 1.03;
}

export async function getSnfFormula() {
  const rows = await prisma.setting.findMany({ where: { key: { in: Object.values(SNF_KEYS) } } });
  const val = Object.fromEntries(rows.map((r) => [r.key, Number(r.value)]));
  const out = { ...DEFAULT_SNF_FORMULA };
  for (const [k, key] of Object.entries(SNF_KEYS)) if (Number.isFinite(val[key])) out[k] = val[key];
  return out;
}
export const SNF_KEYS = { clrDivisor: 'SNF_CLR_DIVISOR', fatFactor: 'SNF_FAT_FACTOR', constant: 'SNF_CONSTANT' };
