'use client';
import { useState } from 'react';
import { dipToLitres } from '@/lib/dip';

const fmt = (v) => (v === null || Number.isNaN(v) ? '–' : Math.round(v).toLocaleString('en-IN'));

export default function UnloadForm({ action, silos, stocks, supplierQtyL }) {
  const [siloId, setSiloId] = useState(silos[0]?.id ?? '');
  const silo = silos.find((s) => s.id === Number(siloId));
  const hasChart = (silo?.dipPoints?.length || 0) >= 2;
  const [mode, setMode] = useState(hasChart ? 'dip' : 'direct');
  const [before, setBefore] = useState('');
  const [after, setAfter] = useState('');
  const [direct, setDirect] = useState('');

  let qty = null;
  let lb = null;
  if (mode === 'dip' && hasChart && before !== '' && after !== '') {
    lb = dipToLitres(silo.dipPoints, Number(before));
    const la = dipToLitres(silo.dipPoints, Number(after));
    qty = (la - lb) * silo.correctionFactor;
  } else if (mode === 'direct' && direct !== '') qty = Number(direct);
  const diff = qty === null ? null : qty - supplierQtyL;
  const sys = stocks[siloId]?.litres ?? 0;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="mode" value={mode} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Unload into silo *</span>
          <select name="siloId" value={siloId} onChange={(e) => { setSiloId(e.target.value); const s = silos.find((x) => x.id === Number(e.target.value)); setMode((s?.dipPoints?.length || 0) >= 2 ? 'dip' : 'direct'); }} className="input">
            {silos.map((s) => <option key={s.id} value={s.id}>{s.name} — now {fmt(stocks[s.id]?.litres ?? 0)} L of {fmt(s.capacityL)} L</option>)}
          </select>
        </label>
        <div>
          <span className="label">Measure by</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setMode('dip')} disabled={!hasChart} className={mode === 'dip' ? 'btn-primary' : 'btn-secondary'}>Dip reading</button>
            <button type="button" onClick={() => setMode('direct')} className={mode === 'direct' ? 'btn-primary' : 'btn-secondary'}>Litres directly</button>
          </div>
          {!hasChart && <p className="mt-1 text-xs text-amber-700">No dip chart for this silo yet — add it in Masters → Silos.</p>}
        </div>
      </div>
      {mode === 'dip' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="label">Dip BEFORE unloading (cm) *</span><input name="dipBeforeCm" type="number" step="0.1" value={before} onChange={(e) => setBefore(e.target.value)} className="input" required /></label>
          <label className="block"><span className="label">Dip AFTER unloading (cm) *</span><input name="dipAfterCm" type="number" step="0.1" value={after} onChange={(e) => setAfter(e.target.value)} className="input" required /></label>
          <p className="text-xs text-slate-500 sm:col-span-2">Wait 15–20 minutes after unloading for foam to settle. Take two readings and enter the average.</p>
        </div>
      ) : (
        <label className="block max-w-xs"><span className="label">Litres received *</span><input name="directLitres" type="number" step="0.1" value={direct} onChange={(e) => setDirect(e.target.value)} className="input" required /></label>
      )}
      <div className="grid gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-4">
        <div><div className="text-xs text-slate-500">Our quantity</div><div className="text-lg font-semibold">{fmt(qty)} L</div>{mode === 'dip' && silo && <div className="text-xs text-slate-400">× factor {silo.correctionFactor}</div>}</div>
        <div><div className="text-xs text-slate-500">Supplier says</div><div className="text-lg font-semibold">{fmt(supplierQtyL)} L</div></div>
        <div><div className="text-xs text-slate-500">Difference</div><div className={`text-lg font-semibold ${diff !== null && diff < 0 ? 'text-red-600' : ''}`}>{diff === null ? '–' : `${diff > 0 ? '+' : ''}${fmt(diff)} L (${((diff / supplierQtyL) * 100).toFixed(2)}%)`}</div></div>
        {mode === 'dip' && lb !== null && <div><div className="text-xs text-slate-500">Silo before: dip vs system</div><div className="text-lg font-semibold">{fmt(lb * silo.correctionFactor)} / {fmt(sys)} L</div></div>}
      </div>
      <button className="btn-success">Confirm unloading</button>
    </form>
  );
}
