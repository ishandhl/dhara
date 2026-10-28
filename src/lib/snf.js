// SNF from the lactometer: SNF % = CLR ÷ clrDivisor + fatFactor × fat % + constant.
// Default is the ISI / BIS formula (CLR/4 + 0.21 F + 0.36); change it in Tolerances & Settings.
export const DEFAULT_SNF_FORMULA = { clrDivisor: 4, fatFactor: 0.21, constant: 0.36 };

export function calcSnf(clr, fat, f = DEFAULT_SNF_FORMULA) {
  if (clr === null || clr === undefined || clr === '' || fat === null || fat === undefined || fat === '') return null;
  const v = Number(clr) / f.clrDivisor + f.fatFactor * Number(fat) + f.constant;
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}

export const ADULTERANTS = ['Water', 'Starch', 'Sugar', 'Urea', 'Salt', 'Neutraliser (soda)', 'Detergent', 'Formalin', 'Hydrogen peroxide', 'Skim milk powder'];
