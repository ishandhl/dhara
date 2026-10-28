import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireView } from '@/lib/auth';
import { PageHeader, Empty } from '@/components/ui';
import { fmtDateTime } from '@/lib/dates';

const PAGE = 100;

export default async function AuditPage({ searchParams }) {
  const sp = await searchParams;
  await requireView('audit');
  const page = Math.max(1, parseInt(sp?.page || '1', 10));
  const where = {};
  if (sp?.entity) where.entity = sp.entity;
  if (sp?.action) where.action = sp.action;
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, include: { user: true }, orderBy: { id: 'desc' }, take: PAGE, skip: (page - 1) * PAGE }),
    prisma.auditLog.count({ where }),
  ]);
  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Every create, edit, cancel and closing, with who did it and the old and new values." />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="entity" defaultValue={sp?.entity} placeholder="Entity (e.g. MilkReceipt)" className="input w-56" />
        <select name="action" defaultValue={sp?.action || ''} className="input w-40">
          <option value="">All actions</option>
          {['CREATE', 'UPDATE', 'CANCEL', 'CLOSE', 'QC', 'UNLOAD', 'LOGIN', 'DELETE'].map((a) => <option key={a}>{a}</option>)}
        </select>
        <button className="btn-secondary">Filter</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>When</th><th>User</th><th>Action</th><th>Record</th><th>Reason</th><th>Details</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap text-xs">{fmtDateTime(r.createdAt)}</td>
                <td className="whitespace-nowrap">{r.user?.name || '—'}</td>
                <td><span className="badge bg-slate-100 text-slate-700">{r.action}</span></td>
                <td className="whitespace-nowrap">{r.entity} {r.entityId ? `#${r.entityId}` : ''}</td>
                <td className="max-w-xs text-xs">{r.reason}</td>
                <td className="max-w-md">
                  {(r.before || r.after) && (
                    <details>
                      <summary className="cursor-pointer text-xs text-brand-600">View</summary>
                      <div className="mt-1 grid gap-2 text-[11px] md:grid-cols-2">
                        {r.before && <pre className="overflow-x-auto rounded bg-red-50 p-2">{JSON.stringify(r.before, null, 1)}</pre>}
                        {r.after && <pre className="overflow-x-auto rounded bg-emerald-50 p-2">{JSON.stringify(r.after, null, 1)}</pre>}
                      </div>
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>No entries.</Empty>}
      </div>
      <div className="mt-3 flex gap-2 text-sm">
        {page > 1 && <Link className="btn-secondary btn-sm" href={`/audit?page=${page - 1}&entity=${sp?.entity || ''}&action=${sp?.action || ''}`}>Previous</Link>}
        {page * PAGE < total && <Link className="btn-secondary btn-sm" href={`/audit?page=${page + 1}&entity=${sp?.entity || ''}&action=${sp?.action || ''}`}>Next</Link>}
        <span className="muted self-center">{total} entries</span>
      </div>
    </div>
  );
}
