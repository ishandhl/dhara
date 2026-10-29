import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireView, requireEdit } from '@/lib/auth';
import { getTolerances, DEFAULT_TOLERANCES, getDensity, getSnfFormula, SNF_KEYS } from '@/lib/tolerance';
import { audit } from '@/lib/audit';
import { run, reqNum, UserError, str } from '@/lib/forms';
import { getNotifySettings, lowStockItems, sendStockReminder, NOTIFY_KEYS } from '@/lib/notify';
import { randomBytes } from 'node:crypto';
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

async function saveNotify(formData) {
  'use server';
  await run('/masters/settings', async () => {
    const user = await requireEdit('masters');
    const topic = str(formData, 'topic');
    const phone = str(formData, 'phone').replace(/[\s-]/g, '');
    const apikey = str(formData, 'apikey');
    if (topic && !/^[A-Za-z0-9_-]{12,64}$/.test(topic)) throw new UserError('Notification topic: 12–64 letters, numbers, - or _ (make it hard to guess)');
    if (phone && !/^\+\d{8,15}$/.test(phone)) throw new UserError('WhatsApp number must start with + and the country code, e.g. +9779812345678');
    if (phone && !apikey) throw new UserError('Enter the CallMeBot API key for WhatsApp');
    for (const [key, value] of [[NOTIFY_KEYS.topic, topic], [NOTIFY_KEYS.phone, phone], [NOTIFY_KEYS.apikey, apikey]]) {
      await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
    }
    await audit({ userId: user.id, action: 'UPDATE', entity: 'Settings', after: { notifyTopic: topic ? 'set' : '', whatsapp: phone || '' } });
    revalidatePath('/masters/settings');
    return '/masters/settings?ok=Reminder settings saved';
  });
}

async function sendTest() {
  'use server';
  await run('/masters/settings', async () => {
    await requireEdit('masters');
    const r = await sendStockReminder({ force: true });
    if (!r.sent.length) throw new UserError(r.errors.join(' · ') || 'Nothing was sent');
    return `/masters/settings?ok=${encodeURIComponent(`Sent to ${r.sent.join(' and ')}: ${r.out} out of stock, ${r.low} low${r.errors.length ? ` (failed: ${r.errors.join('; ')})` : ''}`)}`;
  });
}

export default async function SettingsPage({ searchParams }) {
  const sp = await searchParams;
  await requireView('masters');
  const tol = await getTolerances();
  const density = await getDensity();
  const snf = await getSnfFormula();
  const notify = await getNotifySettings();
  const { out, low } = await lowStockItems();
  const suggested = `storesync-stock-${randomBytes(6).toString('hex')}`;
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

      <section id="reminders" className="card card-pad mt-6 max-w-3xl space-y-5">
        <div>
          <h2 className="h2">Stock reminders · every day at 5 pm</h2>
          <p className="muted mt-1">Sends one message listing general store items that are <b>out of stock</b> or <b>at / below their reorder level</b>. Nothing is sent on days when everything is fine. Right now: <b>{out.length} out of stock</b>, <b>{low.length} low</b>.</p>
        </div>
        <form action={saveNotify} className="space-y-5">
          <div className="rounded-lg border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-900">Phone notification (free, no account)</h3>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm text-slate-600">
              <li>Press <b>Save reminder settings</b> so the topic name below is kept{notify.topic ? ' (done)' : ''}.</li>
              <li>Install the <b>ntfy</b> app (Play Store / App Store) on each phone that should get reminders.</li>
              <li>In the app press <b>+</b> and subscribe to exactly this topic name (same on every phone).</li>
            </ol>
            <Field label="Topic name" hint="Anyone who knows this name can see the reminders, so keep the random part." className="mt-3">
              <input name="topic" defaultValue={notify.topic || suggested} className="input font-mono" />
            </Field>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-900">WhatsApp (free, via CallMeBot)</h3>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm text-slate-600">
              <li>On the phone, open <a href="https://www.callmebot.com/blog/free-api-whatsapp-messages/" target="_blank" rel="noreferrer" className="text-brand-600 underline">callmebot.com → WhatsApp</a>, save the bot&apos;s number and send it the activation message shown there.</li>
              <li>The bot replies with your <b>API key</b>. Enter it and your number below. Leave empty to skip WhatsApp.</li>
            </ol>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="WhatsApp number"><input name="phone" defaultValue={notify.phone} placeholder="+9779812345678" className="input" inputMode="tel" /></Field>
              <Field label="CallMeBot API key"><input name="apikey" defaultValue={notify.apikey} className="input font-mono" autoComplete="off" /></Field>
            </div>
          </div>
          <button className="btn-primary">Save reminder settings</button>
        </form>
        <form action={sendTest} className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
          <button className="btn-secondary">Send test now</button>
          <span className="text-sm text-slate-500">Sends today&apos;s list straight away to the channels saved above.</span>
        </form>
      </section>
    </div>
  );
}
