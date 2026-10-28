export function num(v, dp = 0) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '–';
  return Number(v).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
/** Stock quantity: whole numbers stay whole, kg / litres show up to 2 decimals. */
export function qty(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '–';
  return Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
export const litres =(v) => `${num(v, 0)} L`;
export const pct = (v, dp = 2) => (v === null || v === undefined ? '–' : `${Number(v).toFixed(dp)}%`);
export const round = (v, dp = 2) => Math.round(Number(v) * 10 ** dp) / 10 ** dp;
