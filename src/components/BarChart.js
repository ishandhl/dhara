// Grouped bar chart drawn as SVG on the server. One y-axis, legend + direct labels on the latest day,
// hover a bar for its value (native tooltip), and a table fallback for screen readers.
// Colours: validated categorical slots 1 and 2 (blue, orange) — see the dataviz skill palette.
const SERIES_COLORS = ['#2a78d6', '#eb6834'];

function niceMax(v) {
  if (v <= 0) return 10;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 4, 5, 8, 10].map((m) => m * p).find((c) => c >= v);
}
const fmt = (v) => Math.round(v).toLocaleString('en-IN');
const short = (v) => (v >= 100000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `${Math.round(v)}`);

export default function BarChart({ labels, series, unit = 'L', height = 220, caption }) {
  const W = 640, H = height, padL = 44, padR = 8, padT = 12, padB = 28;
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const groupW = plotW / labels.length;
  const barW = Math.min(22, (groupW - 12) / series.length - 2);
  const y = (v) => padT + plotH - (v / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const last = labels.length - 1;
  return (
    <figure className="w-full">
      {series.length > 1 && (
        <figcaption className="mb-2 flex flex-wrap gap-4 text-xs text-slate-600">
          {series.map((s, i) => <span key={s.name} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES_COLORS[i] }} />{s.name}</span>)}
          {caption && <span className="text-slate-400">{caption}</span>}
        </figcaption>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={series.map((s) => s.name).join(' and ')}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth="1" strokeDasharray={t === 0 ? '' : '3 3'} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#64748b">{short(t)}</text>
          </g>
        ))}
        {labels.map((lab, gi) => {
          const gx = padL + gi * groupW + (groupW - series.length * (barW + 2)) / 2;
          return (
            <g key={lab}>
              {series.map((s, si) => {
                const v = s.values[gi] || 0;
                const h = Math.max(0, plotH - (y(v) - padT));
                const x = gx + si * (barW + 2);
                const r = Math.min(4, h);
                // Rounded top, square base on the axis.
                const d = h > 0 ? `M${x},${y(0)} V${y(v) + r} Q${x},${y(v)} ${x + r},${y(v)} H${x + barW - r} Q${x + barW},${y(v)} ${x + barW},${y(v) + r} V${y(0)} Z` : '';
                return (
                  <g key={s.name}>
                    <rect x={x - 2} y={padT} width={barW + 4} height={plotH} fill="transparent"><title>{`${lab} · ${s.name}: ${fmt(v)} ${unit}`}</title></rect>
                    {d && <path d={d} fill={SERIES_COLORS[si]} pointerEvents="none" />}
                    {gi === last && v > 0 && <text x={x + barW / 2} y={y(v) - 4} textAnchor="middle" fontSize="10" fontWeight="600" fill="#334155">{short(v)}</text>}
                  </g>
                );
              })}
              <text x={padL + gi * groupW + groupW / 2} y={H - 8} textAnchor="middle" fontSize="11" fill={gi === last ? '#0f172a' : '#64748b'} fontWeight={gi === last ? 600 : 400}>{lab}</text>
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <thead><tr><th>Day</th>{series.map((s) => <th key={s.name}>{s.name} ({unit})</th>)}</tr></thead>
        <tbody>{labels.map((lab, i) => <tr key={lab}><td>{lab}</td>{series.map((s) => <td key={s.name}>{fmt(s.values[i] || 0)}</td>)}</tr>)}</tbody>
      </table>
    </figure>
  );
}
