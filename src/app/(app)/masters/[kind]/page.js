import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireView } from '@/lib/auth';
import { MASTERS, catLabel } from '@/lib/masters';
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
        {f.options.map((o) => <option key={o} value={o}>{optionLabel(f, o)}</option>)}
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
  const num = f.type === 'number' || f.type === 'int';
  return <input name={f.name} type={num ? 'number' : 'text'} inputMode={num ? 'decimal' : undefined} step={f.type === 'int' ? '1' : f.step || 'any'} defaultValue={v} required={f.required} placeholder={f.placeholder} className="input" />;
}

const isNum = (f) => f.type === 'number' || f.type === 'int';
// "COLLECTION_CENTRE" → "Collection centre"; store categories use their own labels ("Cups & lids").
const optionLabel = (f, o) => (catLabel(o) !== o ? catLabel(o) : o.charAt(0) + o.slice(1).toLowerCase().replaceAll('_', ' '));

function cell(f, row, rel) {
  const v = row[f.name];
  if (f.type === 'checkbox') return v ? <span className="badge bg-emerald-100 text-emerald-800">Yes</span> : <span className="badge bg-slate-200 text-slate-600">No</span>;
  if (f.type === 'relation') return (rel[f.name] || []).find((o) => o.id === v)?.[f.labelField] || '—';
  if (v === null || v === undefined || v === '') return '—';
  if (f.type === 'select') return optionLabel(f, String(v));
  return String(v) + (f.suffix || '');
}

export default async function MasterPage({ params, searchParams }) {
  const { kind } = await params;
  const sp = await searchParams;
  await requireView('masters');
  const cfg = MASTERS[kind];
  if (!cfg) notFound();
  const [all, rel] = await Promise.all([prisma[cfg.model].findMany({ orderBy: cfg.orderBy }), relationOptions(cfg)]);
  const editId = sp?.edit ? parseInt(sp.edit, 10) : null;
  const editing = editId ? all.find((r) => r.id === editId) : null;
  const adding = sp?.new === '1';
  const fieldMap = Object.fromEntries(cfg.fields.map((f) => [f.name, f]));
  const action = saveMaster.bind(null, kind);
  const noun = cfg.noun || 'record';
  const base = `/masters/${kind}`;

  // Search + category filter (lists are small, so filter here rather than in SQL).
  const q = (sp?.q || '').trim().toLowerCase();
  const catField = fieldMap.category?.type === 'select' ? fieldMap.category : null;
  const cat = catField && catField.options.includes(sp?.cat) ? sp.cat : '';
  const textFields = cfg.fields.filter((f) => !f.type || f.type === 'text').map((f) => f.name);
  const rows = all.filter((r) => (!cat || r.category === cat) && (!q || textFields.some((n) => String(r[n] ?? '').toLowerCase().includes(q))));
  const catCounts = catField ? Object.fromEntries(catField.options.map((o) => [o, all.filter((r) => r.category === o).length])) : {};
  const href = (over) => {
    const p = new URLSearchParams({ ...(q && { q: sp.q }), ...(cat && { cat }), ...over });
    for (const [k, v] of [...p]) if (!v) p.delete(k);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };
  const cols = cfg.columns.filter((c) => c !== cfg.primary && c !== cfg.secondary);

  return (
    <div>
      <PageHeader
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={!adding && !editing && <Link href={href({ new: '1' })} className="btn-primary">+ Add {noun}</Link>}
      />
      <Flash sp={sp} />

      {(adding || editing) && (
        <form action={action} className="card card-pad mb-5" key={editing?.id || 'new'}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="h2">{editing ? `Edit ${editing[cfg.primary || cfg.columns[0]]}` : `Add ${noun}`}</h2>
            <Link href={href({})} className="text-sm text-slate-500 hover:underline">Cancel</Link>
          </div>
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {cfg.fields.map((f) =>
              f.type === 'checkbox' ? (
                <label key={f.name} className="flex items-center gap-2 self-end pb-2.5 text-sm">
                  <Input f={f} value={editing?.[f.name]} rel={rel} /> {f.label}
                </label>
              ) : (
                <Field key={f.name} label={f.label + (f.required ? ' *' : '')} hint={f.hint}>
                  <Input f={f} value={editing?.[f.name]} rel={rel} />
                </Field>
              )
            )}
          </div>
          <div className="mt-4 flex gap-2">
            <button className="btn-primary">{editing ? 'Save changes' : `Add ${noun}`}</button>
            <Link href={href({})} className="btn-secondary">Cancel</Link>
          </div>
        </form>
      )}

      <div className="card">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-3">
          <form action={base} className="flex flex-1 items-center gap-2">
            {cat && <input type="hidden" name="cat" value={cat} />}
            <input name="q" defaultValue={sp?.q || ''} placeholder={`Search ${noun}s…`} className="input max-w-xs" />
            <button className="btn-secondary">Search</button>
            {q && <Link href={href({ q: '' })} className="text-sm text-slate-500 hover:underline">Clear</Link>}
          </form>
          <span className="text-sm text-slate-500">{rows.length === all.length ? `${all.length} ${noun}s` : `${rows.length} of ${all.length}`}</span>
        </div>
        {catField && (
          <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-3 py-2.5">
            <Link href={href({ cat: '' })} className={`badge px-3 py-1 ${!cat ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>All</Link>
            {catField.options.filter((o) => catCounts[o]).map((o) => (
              <Link key={o} href={href({ cat: o })} className={`badge px-3 py-1 ${cat === o ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                {optionLabel(catField, o)} <span className="ml-1 opacity-60">{catCounts[o]}</span>
              </Link>
            ))}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                {cfg.primary && <th>{fieldMap[cfg.primary].label}</th>}
                {cols.map((c) => <th key={c} className={isNum(fieldMap[c]) ? 'num' : ''} title={fieldMap[c].label}>{fieldMap[c].short || fieldMap[c].label}</th>)}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={editId === r.id ? 'bg-brand-50' : ''}>
                  {cfg.primary && (
                    <td className="min-w-[14rem]">
                      <div className="font-medium text-slate-900">{r[cfg.primary]}</div>
                      {cfg.secondary && r[cfg.secondary] && <div className="text-xs text-slate-500">{r[cfg.secondary]}</div>}
                    </td>
                  )}
                  {cols.map((c) => <td key={c} className={isNum(fieldMap[c]) ? 'num' : 'whitespace-nowrap'}>{cell(fieldMap[c], r, rel)}</td>)}
                  <td className="whitespace-nowrap text-right">
                    <Link href={href({ edit: String(r.id) })} className="text-brand-600 hover:underline">Edit</Link>
                    {cfg.detail && <Link href={`${base}/${r.id}`} className="ml-3 text-brand-600 hover:underline">Packaging</Link>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {all.length === 0 && <Empty>No records yet. Click “+ Add {noun}” to add the first one.</Empty>}
        {all.length > 0 && rows.length === 0 && <Empty>Nothing matches. <Link href={base} className="text-brand-600 hover:underline">Show all</Link></Empty>}
      </div>
    </div>
  );
}
