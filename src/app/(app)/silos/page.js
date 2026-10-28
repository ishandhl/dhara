import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireView } from '@/lib/auth';
import { canEdit } from '@/lib/roles';
import { todayISO, toDateOnly, fmtDate, fmtDateTime } from '@/lib/dates';
import { num } from '@/lib/format';
import { siloStocks } from '@/lib/stock';
import { getDensity, getTolerances, flag } from '@/lib/tolerance';
import { recordDip, transferMilk, adjustSilo } from './actions';
import { Flash, PageHeader, Field, FlagBadge, Empty } from '@/components/ui';

export default async function SilosPage({ searchParams }) {
  const sp = await searchParams;
  const user = await requireView('silos');
  const today = todayISO();
  const [silos, stocks, density, tols] = await Promise.all([
    prisma.silo.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    siloStocks(),
    getDensity(),
    getTolerances(),
  ]);
  const lastDips = await prisma.siloDip.findMany({ where: { date: toDateOnly(today) }, orderBy: { id: 'desc' } });
  const moves = await prisma.siloMovement.findMany({ where: { date: toDateOnly(today) }, orderBy: { id: 'desc' }, take: 50, include: { silo: true } });
  const total = silos.reduce((a, s) => a + (stocks[s.id]?.litres || 0), 0);
  const edit = canEdit(user.role, 'silos');

  return (
    <div>
      <PageHeader title="Silo Stock" subtitle={`Live stock · ${fmtDate(today)} · total ${num(total)} L`} />
      <Flash sp={sp} />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {silos.map((s) => {
          const st = stocks[s.id] || { litres: 0, kgFat: 0, kgSnf: 0 };
          const full = Math.min(100, (st.litres / s.capacityL) * 100);
          const dip = lastDips.find((d) => d.siloId === s.id);
          const kg = st.litres * density;
          return (
            <Link key={s.id} href={`/silos/${s.id}`} className="card card-pad block hover:border-brand-600">
              <div className="flex items-center justify-between"><span className="font-semibold">{s.name}</span><span className="text-xs text-slate-500">{num(s.capacityL)} L</span></div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{num(st.litres)} L</div>
              <div className="mt-2 h-2 overflow-hidden rounded bg-slate-100"><div className="h-full bg-brand-600" style={{ width: `${full}%` }} /></div>
              <div className="mt-2 text-xs text-slate-500">Fat {kg > 0 ? ((st.kgFat / kg) * 100).toFixed(2) : '–'}% · SNF {kg > 0 ? ((st.kgSnf / kg) * 100).toFixed(2) : '–'}%</div>
              {dip && <div className="mt-1 text-xs">Last dip ({dip.kind.toLowerCase()}): {num(dip.litres)} L vs system {num(dip.systemLitres)} L <FlagBadge flag={flag(dip.systemLitres ? (dip.varianceL / dip.systemLitres) * 100 : null, tols.SILO_LOSS)}>{`${dip.varianceL > 0 ? '+' : ''}${num(dip.varianceL)} L`}</FlagBadge></div>}
            </Link>
          );
        })}
      </div>
      {edit && (
        <div className="mb-5 grid gap-5 lg:grid-cols-3">
          <form action={recordDip} className="card card-pad space-y-3">
            <h2 className="h2">Record dip reading</h2>
            <Field label="Silo"><select name="siloId" className="input">{silos.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <Field label="Type"><select name="kind" className="input" defaultValue="CLOSING"><option value="CLOSING">Closing (end of day)</option><option value="OPENING">Opening</option><option value="CHECK">Check</option></select></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Dip (cm)"><input name="dipCm" type="number" step="0.1" className="input" /></Field>
              <Field label="or Litres"><input name="litres" type="number" step="0.1" className="input" /></Field>
            </div>
            <Field label="Note"><input name="note" className="input" /></Field>
            <button className="btn-primary w-full">Save reading</button>
          </form>
          <form action={transferMilk} className="card card-pad space-y-3">
            <h2 className="h2">Transfer between silos</h2>
            <Field label="From"><select name="fromId" className="input">{silos.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <Field label="To"><select name="toId" className="input" defaultValue={silos[1]?.id}>{silos.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <Field label="Litres"><input name="litres" type="number" step="0.1" className="input" required /></Field>
            <Field label="Note"><input name="note" className="input" /></Field>
            <button className="btn-primary w-full">Save transfer</button>
          </form>
          {canEdit(user.role, 'approve') && (
            <form action={adjustSilo} className="card card-pad space-y-3">
              <h2 className="h2">Stock adjustment (Manager)</h2>
              <p className="text-xs text-slate-500">Books a dip variance into the system, e.g. −120 L to match the closing dip. Always recorded with your name and reason.</p>
              <Field label="Silo"><select name="siloId" className="input">{silos.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
              <Field label="Litres (+ or −)"><input name="litres" type="number" step="0.1" className="input" required /></Field>
              <Field label="Reason *"><input name="reason" className="input" required /></Field>
              <button className="btn-danger w-full">Save adjustment</button>
            </form>
          )}
        </div>
      )}
      <div className="card overflow-x-auto">
        <div className="border-b border-slate-100 px-4 py-3"><h2 className="h2">Today&apos;s movements</h2></div>
        <table className="table">
          <thead><tr><th>Time</th><th>Silo</th><th>Type</th><th className="num">Litres</th><th className="num">kg fat</th><th>Note</th></tr></thead>
          <tbody>
            {moves.map((m) => (
              <tr key={m.id}>
                <td className="whitespace-nowrap text-xs">{fmtDateTime(m.createdAt)}</td>
                <td>{m.silo.name}</td>
                <td>{m.type.replace('_', ' ')}</td>
                <td className={`num ${m.litres < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{m.litres > 0 ? '+' : ''}{num(m.litres, 1)}</td>
                <td className="num">{num(m.kgFat, 1)}</td>
                <td className="text-xs text-slate-500">{m.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {moves.length === 0 && <Empty>No movements today.</Empty>}
      </div>
    </div>
  );
}
