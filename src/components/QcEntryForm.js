'use client';
import { useState, useTransition } from 'react';
import { calcSnf, ADULTERANTS } from '@/lib/snf';

/** Readings outside what milk normally shows — usually a typo (3.5 → 35, 1000 → 10000). Asked once before saving. */
function unusual(form, fat, clr) {
  const v = (n) => Number(String(form.elements[n]?.value || '').replace(',', '.'));
  const w = [];
  const q = v('supplierQtyL');
  const t = form.elements.temperatureC?.value ? v('temperatureC') : null;
  const a = form.elements.acidityPct?.value ? v('acidityPct') : null;
  if (q > 15000) w.push(`quantity ${q} L`);
  if (fat && (Number(fat) < 2.5 || Number(fat) > 8)) w.push(`fat ${fat}%`);
  if (clr && (Number(clr) < 24 || Number(clr) > 34)) w.push(`CLR ${clr}`);
  if (t !== null && t > 15) w.push(`temperature ${t} °C`);
  if (a !== null && (a < 0.1 || a > 0.18)) w.push(`acidity ${a}%`);
  return w;
}

function Test({ name, label }) {
  const [v, setV] = useState('');
  const btn = (val, on) => `badge px-3 py-1.5 ${v === val ? on : 'border border-slate-300 bg-white text-slate-700'}`;
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex gap-2">
        <button type="button" onClick={() => setV(v === 'PASS' ? '' : 'PASS')} className={btn('PASS', 'bg-emerald-600 text-white')}>Pass</button>
        <button type="button" onClick={() => setV(v === 'FAIL' ? '' : 'FAIL')} className={btn('FAIL', 'bg-red-600 text-white')}>Fail</button>
      </div>
      <input type="hidden" name={name} value={v} />
    </div>
  );
}

function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export default function QcEntryForm({ action, suppliers, tankers, today, formula }) {
  const [remark, setRemark] = useState('');
  const [fat, setFat] = useState('');
  const [clr, setClr] = useState('');
  const [found, setFound] = useState([]);
  const snf = calcSnf(clr, fat, formula);
  const adulterated = found.length > 0;
  const toggle = (a) => setFound((f) => (f.includes(a) ? f.filter((x) => x !== a) : [...f, a]));
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();

  // Sent without leaving the page: a mistake shows here and nothing typed is lost; success opens a fresh form.
  const onSubmit = (e) => {
    e.preventDefault();
    if (pending) return; // a second tap while saving does nothing
    const fd = new FormData(e.currentTarget, e.nativeEvent.submitter);
    setError(null);
    startTransition(async () => {
      const r = await action(fd);
      if (r?.error) setError(r.error);
    });
  };

  return (
    <form onSubmit={onSubmit} className="card card-pad space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date (AD) *" hint="Today unless entering a missed tanker"><input type="date" name="date" defaultValue={today} max={today} className="input" required /></Field>
        <Field label="Supplier / collection centre *">
          <select name="supplierId" className="input" required defaultValue="">
            <option value="" disabled>Select…</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Vehicle number *" hint="Type or pick a registered tanker">
          <input name="vehicleNo" list="tankers" className="input uppercase" placeholder="Ba 1 Kha 1234" required autoComplete="off" />
          <datalist id="tankers">{tankers.map((t) => <option key={t.id} value={t.number}>{t.supplier?.name || ''}</option>)}</datalist>
        </Field>
        <Field label="Milk quantity (L) *" hint="As per supplier's slip"><input name="supplierQtyL" type="number" inputMode="decimal" step="0.1" min="0" className="input" required /></Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Temperature (°C)"><input name="temperatureC" type="number" inputMode="decimal" step="0.1" className="input" /></Field>
        <Field label="Fat % *"><input name="fatPct" type="number" inputMode="decimal" step="0.01" min="0" max="15" className="input" required value={fat} onChange={(e) => setFat(e.target.value)} /></Field>
        <Field label="Lacto (CLR) *" hint="Corrected lactometer reading"><input name="lactoReading" type="number" inputMode="decimal" step="0.1" min="15" max="40" className="input" required value={clr} onChange={(e) => setClr(e.target.value)} /></Field>
        <Field label="SNF % (auto)" hint={`CLR/${formula.clrDivisor} + ${formula.fatFactor}×Fat + ${formula.constant}`}>
          <div className={`input bg-slate-50 font-semibold tabular-nums ${snf !== null && snf < 8 ? 'text-red-700' : ''}`}>{snf === null ? '–' : snf.toFixed(2)}</div>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Acidity %" hint="Normal about 0.13–0.15"><input name="acidityPct" type="number" inputMode="decimal" step="0.001" min="0" max="1" className="input" /></Field>
        <Test name="cobTest" label="COB test" />
        <Test name="alcoholTest" label="Alcohol test" />
      </div>

      <fieldset>
        <legend className="label">Adulteration test</legend>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setFound([])} className={`badge px-3 py-1.5 ${!adulterated ? 'bg-emerald-600 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}>None found</button>
          {ADULTERANTS.map((a) => (
            <button type="button" key={a} onClick={() => toggle(a)} className={`badge px-3 py-1.5 ${found.includes(a) ? 'bg-red-600 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}>{a}</button>
          ))}
        </div>
        <input type="hidden" name="adulteration" value={adulterated ? found.join(', ') : 'NONE'} />
        {adulterated && <p className="mt-2 text-sm font-medium text-red-700">Adulteration found: {found.join(', ')}. Reject the tanker, or write a remark to accept it.</p>}
      </fieldset>

      <Field label={adulterated ? 'Remarks * (required)' : 'Remarks'} hint="Required when rejecting or accepting adulterated milk">
        <input name="qcRemarks" className="input" placeholder="e.g. Sour smell, rejected at gate" required={adulterated} value={remark} onChange={(e) => setRemark(e.target.value)} />
      </Field>

      {error && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</div>}
      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        <button name="decision" value="ACCEPT" className="btn-success disabled:opacity-60" disabled={pending} onClick={(e) => {
          if (!e.currentTarget.form.checkValidity()) return;
          const w = unusual(e.currentTarget.form, fat, clr);
          if (w.length && !window.confirm(`These readings are unusual: ${w.join(', ')}.\n\nAre they right? Press OK to save, Cancel to check them.`)) e.preventDefault();
        }}>{pending ? 'Saving…' : 'Accept'}</button>
        <button name="decision" value="REJECT" className="btn-danger disabled:opacity-60" disabled={pending} onClick={(e) => { if (!remark.trim()) { e.preventDefault(); alert('Write the reason for rejection in Remarks'); } }}>Reject tanker</button>
      </div>
    </form>
  );
}
