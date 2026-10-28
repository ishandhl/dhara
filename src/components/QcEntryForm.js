'use client';
import { useState } from 'react';
import { calcSnf, ADULTERANTS } from '@/lib/snf';

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

  return (
    <form action={action} className="card card-pad space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date (AD) *"><input type="date" name="date" defaultValue={today} max={today} className="input" required /></Field>
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

      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        <button name="decision" value="ACCEPT" className="btn-success">Accept</button>
        <button name="decision" value="REJECT" className="btn-danger" onClick={(e) => { if (!remark.trim()) { e.preventDefault(); alert('Write the reason for rejection in Remarks'); } }}>Reject tanker</button>
      </div>
    </form>
  );
}
