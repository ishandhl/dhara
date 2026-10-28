import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireView } from '@/lib/auth';
import { MASTERS } from '@/lib/masters';
import { saveMaster } from '../actions';
import { Flash, PageHeader, Field, Empty } from '@/components/ui';

async function relationOptions(cfg) {
  const out = {};
  for (const f of cfg.fields.filter((x) => x.type === 'relation')) {
    out[f.name] = await prisma[f.model].findMany({ orderBy: { [f.labelField]: 'asc' } });
  }
  return out;
}

function Input({ f, value, rel }) {
  const v = value ?? (f.default !== undefined ? f.default : '');
  if (f.type === 'checkbox') {
    return <input type="checkbox" name={f.name} defaultChecked={value ?? f.default ?? false} className="h-4 w-4" />;
  }
  if (f.type === 'select') {
    return (
      <select name={f.name} defaultValue={v} className="input">
        {f.options.map((o) => <option key={o} value={o}>{o.replaceAll('_', ' ')}</option>)}
      </select>
    );
  }
  if (f.type === 'relation') {
    return (
      <select name={f.name} defaultValue={value ?? ''} className="input">
        <option value="">—</option>
        {(rel[f.name] || []).map((o) => <option key={o.id} value={o.id}>{o[f.labelField]}</option>)}
      </select>
    );
  }
  const type = f.type === 'number' || f.type === 'int' ? 'number' : 'text';
  return <input name={f.name} type={type} step={f.type === 'int' ? '1' : f.step || 'any'} defaultValue={v} required={f.required} placeholder={f.placeholder} className="input" />;
}

function cell(f, row, rel) {
  const v = row[f.name];
  if (f.type === 'checkbox') return v ? <span className="badge bg-emerald-100 text-emerald-800">Yes</span> : <span className="badge bg-slate-200 text-slate-600">No</span>;
  if (f.type === 'relation') return (rel[f.name] || []).find((o) => o.id === v)?.[f.labelField] || '—';
  if (v === null || v === undefined || v === '') return '—';
  return String(v).replaceAll('_', ' ');
}

export default async function MasterPage({ params, searchParams }) {
  const { kind } = await params;
  const sp = await searchParams;
  await requireView('masters');
  const cfg = MASTERS[kind];
  if (!cfg) notFound();
  const rows = await prisma[cfg.model].findMany({ orderBy: cfg.orderBy });
  const rel = await relationOptions(cfg);
  const editId = sp?.edit ? parseInt(sp.edit, 10) : null;
  const editing = editId ? rows.find((r) => r.id === editId) : null;
  const fieldMap = Object.fromEntries(cfg.fields.map((f) => [f.name, f]));
  const action = saveMaster.bind(null, kind);

  return (
    <div>
      <PageHeader title={cfg.title} subtitle={cfg.subtitle} />
      <Flash sp={sp} />
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="card overflow-x-auto xl:col-span-2">
          <table className="table">
            <thead>
              <tr>
                {cfg.columns.map((c) => <th key={c}>{fieldMap[c].label}</th>)}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={editId === r.id ? 'bg-brand-50' : ''}>
                  {cfg.columns.map((c) => <td key={c}>{cell(fieldMap[c], r, rel)}</td>)}
                  <td className="whitespace-nowrap text-right">
                    <Link href={`/masters/${kind}?edit=${r.id}`} className="text-brand-600 hover:underline">Edit</Link>
                    {cfg.detail && <Link href={`/masters/${kind}/${r.id}`} className="ml-3 text-brand-600 hover:underline">{kind === 'silos' ? 'Dip chart' : 'Packaging'}</Link>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <Empty>No records yet. Add the first one.</Empty>}
        </div>
        <form action={action} className="card card-pad h-fit space-y-3" key={editing?.id || 'new'}>
          <div className="flex items-center justify-between">
            <h2 className="h2">{editing ? 'Edit' : 'Add new'}</h2>
            {editing && <Link href={`/masters/${kind}`} className="text-sm text-slate-500 hover:underline">Cancel</Link>}
          </div>
          {editing && <input type="hidden" name="id" value={editing.id} />}
          {cfg.fields.map((f) =>
            f.type === 'checkbox' ? (
              <label key={f.name} className="flex items-center gap-2 text-sm">
                <Input f={f} value={editing?.[f.name]} rel={rel} /> {f.label}
              </label>
            ) : (
              <Field key={f.name} label={f.label + (f.required ? ' *' : '')} hint={f.hint}>
                <Input f={f} value={editing?.[f.name]} rel={rel} />
              </Field>
            )
          )}
          <button className="btn-primary w-full">{editing ? 'Save changes' : 'Add'}</button>
        </form>
      </div>
    </div>
  );
}
