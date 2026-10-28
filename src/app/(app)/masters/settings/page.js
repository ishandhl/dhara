import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireView, requireEdit } from '@/lib/auth';
import { getTolerances, DEFAULT_TOLERANCES, getDensity, getSnfFormula, SNF_KEYS } from '@/lib/tolerance';
import { audit } from '@/lib/audit';
import { run, reqNum, UserError } from '@/lib/forms';
import { Flash, PageHeader, Field } from '@/components/ui';

async function saveSettings(formData) {
  'use server';
  await run('/masters/settings', async () => {
    const user = await requireEdit('masters');
    const before = await getTolerances();
    for (const t of DEFAULT_TOLERANCES) {
      const greenPct = reqNum(formData, `${t.key}_green`, `${t.label} green`);
      const amberPct = reqNum(formData, `${t.key}_amber`, `${t.label} amber`);
      if (amberPct < greenPct) throw new UserError(`${t.label}: amber limit must be ≥ green limit`);
      await prisma.tolerance.upsert({ where: { key: t.key }, create: { key: t.key, label: t.label, greenPct, amberPct }, update: { greenPct, amberPct } });
    }
    const density = reqNum(formData, 'density', 'Milk density');
    if (density < 1.02 || density > 1.04) throw new UserError('Milk density should be between 1.020 and 1.040');
    await prisma.setting.upsert({ where: { key: 'MILK_DENSITY' }, create: { key: 'MILK_DENSITY', value: String(density) }, update: { value: String(density) } });
    const snf = Object.fromEntries(Object.entries(SNF_KEYS).map(([k, key]) => [k, reqNum(formData, key, 'SNF formula')]));
    if (snf.clrDivisor <= 0) throw new UserError('SNF formula: CLR divisor must be above 0');
    for (const [k, key] of Object.entries(SNF_KEYS)) {
      await prisma.setting.upsert({ where: { key }, create: { key, value: String(snf[k]) }, update: { value: String(snf[k]) } });
    }
    await audit({ userId: user.id, action: 'UPDATE', entity: 'Settings', before, after: { ...(await getTolerances()), density, snf } });
    revalidatePath('/masters/settings');
  });
}

export default async function SettingsPage({ searchParams }) {
  const sp = await searchParams;
  await requireView('masters');
  const tol = await getTolerances();
  const density = await getDensity();
  const snf = await getSnfFormula();
  return (
    <div>
      <PageHeader title="Tolerances & Settings" subtitle="Variance up to the green limit is normal; up to amber needs watching; above amber is flagged red and needs a reason." />
      <Flash sp={sp} />
      <form action={saveSettings} className="card card-pad max-w-3xl space-y-5">
        <table className="table">
          <thead><tr><th>Check</th><th className="num">Green up to (%)</th><th className="num">Amber up to (%)</th></tr></thead>
          <tbody>
            {DEFAULT_TOLERANCES.map((t) => (
              <tr key={t.key}>
                <td>{t.label}</td>
                <td><input name={`${t.key}_green`} type="number" step="0.01" defaultValue={tol[t.key].greenPct} className="input text-right" /></td>
                <td><input name={`${t.key}_amber`} type="number" step="0.01" defaultValue={tol[t.key].amberPct} className="input text-right" /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <Field label="Milk density (kg per litre)" hint="Used to convert litres to kg fat and kg SNF. Typical 1.028–1.032." className="max-w-xs">
          <input name="density" type="number" step="0.001" defaultValue={density} className="input" />
        </Field>
        <div>
          <span className="label">SNF formula (from lactometer)</span>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            SNF % = CLR ÷ <input name={SNF_KEYS.clrDivisor} type="number" step="any" defaultValue={snf.clrDivisor} className="input w-20" />
            + <input name={SNF_KEYS.fatFactor} type="number" step="any" defaultValue={snf.fatFactor} className="input w-20" /> × Fat %
            + <input name={SNF_KEYS.constant} type="number" step="any" defaultValue={snf.constant} className="input w-20" />
          </div>
          <span className="mt-1 block text-xs text-slate-400">Default is the ISI / BIS formula: CLR/4 + 0.21 × Fat + 0.36. Change it to match your lab&apos;s formula.</span>
        </div>
        <button className="btn-primary">Save settings</button>
      </form>
    </div>
  );
}
