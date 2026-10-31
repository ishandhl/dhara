/**
 * Next document number for a day prefix (R2083…-, B2083…-, C2083…-), by the highest number used.
 * Sorting the text would put "-99" after "-100" and repeat a number from the 100th entry of a day.
 */
export async function nextNo(tx, model, field, prefix, pad = 2) {
  const rows = await tx[model].findMany({ where: { [field]: { startsWith: prefix } }, select: { [field]: true } });
  const n = rows.reduce((m, r) => Math.max(m, parseInt(r[field].slice(prefix.length), 10) || 0), 0) + 1;
  return prefix + String(n).padStart(pad, '0');
}
