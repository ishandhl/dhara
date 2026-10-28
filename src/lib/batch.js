import { round } from './format';

/** Yield and fat balance for a batch (with inputs/outputs/losses/byProducts loaded). */
export function batchSummary(b, density) {
  const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
  const inputL = sum(b.inputs, (i) => i.litres);
  const packedL = sum(b.outputs, (o) => o.litres);
  const byL = sum(b.byProducts, (x) => x.litres);
  const lossL = sum(b.losses, (x) => x.litres);
  const unexplainedL = inputL - packedL - byL - lossL;
  const unexplainedPct = inputL ? (unexplainedL / inputL) * 100 : null;
  const totalLossPct = inputL ? ((lossL + unexplainedL) / inputL) * 100 : null;

  const fatIn = sum(b.inputs, (i) => (i.fatPct ? i.litres * density * i.fatPct / 100 : 0));
  let fatOut = null;
  let fatUnexplained = null;
  if (b.fatPct) {
    fatOut = (packedL + lossL) * density * b.fatPct / 100 + sum(b.byProducts, (x) => (x.fatPct ? x.litres * density * x.fatPct / 100 : 0));
    fatUnexplained = fatIn - fatOut;
  }
  return {
    inputL: round(inputL, 1), packedL: round(packedL, 1), byL: round(byL, 1), lossL: round(lossL, 1),
    unexplainedL: round(unexplainedL, 1), unexplainedPct: unexplainedPct === null ? null : round(unexplainedPct, 2),
    totalLossL: round(lossL + unexplainedL, 1), // milk in − packed − by-products
    totalLossPct: totalLossPct === null ? null : round(totalLossPct, 2),
    yieldPct: inputL ? round((packedL / inputL) * 100, 2) : null,
    fatIn: round(fatIn, 2), fatOut: fatOut === null ? null : round(fatOut, 2),
    fatUnexplained: fatUnexplained === null ? null : round(fatUnexplained, 2),
    fatUnexplainedPct: fatUnexplained === null || !fatIn ? null : round((fatUnexplained / fatIn) * 100, 2),
  };
}

/** Expected packaging use from outputs and the product bill of materials. */
export function expectedPackaging(outputs, bomByProduct) {
  const exp = {};
  for (const o of outputs) {
    for (const p of bomByProduct[o.productId] || []) {
      exp[p.packagingItemId] = (exp[p.packagingItemId] || 0) + o.units * p.qtyPerUnit;
    }
  }
  return exp;
}
