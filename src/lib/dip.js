/**
 * Convert a dip reading (cm) to litres with the silo's dip chart.
 * points: [{cm, litres}] — linear interpolation between points,
 * and the nearest segment is extended past the ends.
 * Returns null when the chart has fewer than 2 points.
 */
export function dipToLitres(points, cm) {
  const pts = [...(points || [])].sort((a, b) => a.cm - b.cm);
  if (pts.length < 2 || cm === null || cm === undefined || Number.isNaN(cm)) return null;
  let i = pts.findIndex((p) => p.cm >= cm);
  if (i === -1) i = pts.length - 1; // above chart → extend last segment
  if (i === 0) i = 1; // below chart → extend first segment
  const a = pts[i - 1];
  const b = pts[i];
  const litres = a.litres + ((cm - a.cm) * (b.litres - a.litres)) / (b.cm - a.cm);
  return Math.max(0, litres);
}
