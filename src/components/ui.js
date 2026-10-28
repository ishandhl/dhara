import Link from 'next/link';
import Icon from './Icon';

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="h1">{title}</h1>
        {subtitle && <p className="muted mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Flash({ sp }) {
  if (!sp) return null;
  if (sp.error) return <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">{sp.error}</div>;
  if (sp.ok) return <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">{sp.ok}</div>;
  return null;
}

const FLAG = {
  green: 'bg-emerald-100 text-emerald-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800',
};
export function FlagBadge({ flag, children }) {
  if (!flag) return <span>{children}</span>;
  return <span className={`badge ${FLAG[flag]}`}>{children}</span>;
}

const STATUS = {
  PENDING_QC: 'bg-amber-100 text-amber-800',
  ACCEPTED: 'bg-emerald-100 text-emerald-800',
  UNLOADED: 'bg-blue-100 text-blue-800',
  REJECTED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-slate-200 text-slate-600',
  OPEN: 'bg-amber-100 text-amber-800',
  CLOSED: 'bg-emerald-100 text-emerald-800',
  DRAFT: 'bg-amber-100 text-amber-800',
  DISPATCHED: 'bg-emerald-100 text-emerald-800',
};
const STATUS_LABEL = { PENDING_QC: 'Waiting QC', ACCEPTED: 'Accepted', UNLOADED: 'In silo', REJECTED: 'Rejected', CANCELLED: 'Cancelled', OPEN: 'Open', CLOSED: 'Closed', DRAFT: 'Draft', DISPATCHED: 'Dispatched' };
export function StatusBadge({ status }) {
  return <span className={`badge ${STATUS[status] || 'bg-slate-100 text-slate-700'}`}>{STATUS_LABEL[status] || String(status).replace('_', ' ')}</span>;
}

export function Field({ label, children, hint, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

const TONE = {
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600',
  violet: 'bg-violet-50 text-violet-600',
  slate: 'bg-slate-100 text-slate-600',
};

/** KPI tile: label, big number, one line of context. Optional icon and link. */
export function Stat({ label, value, unit, sub, href, icon, tone = 'blue' }) {
  const body = (
    <div className={`card card-pad h-full ${href ? 'transition hover:border-blue-300 hover:shadow-md' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-[13px] font-medium text-slate-500">{label}</div>
        {icon && <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TONE[tone]}`}><Icon name={icon} className="h-4 w-4" /></span>}
      </div>
      <div className="mt-1 text-[26px] font-semibold leading-tight tabular-nums tracking-tight text-slate-900">{value}{unit && <span className="ml-1 text-base font-medium text-slate-400">{unit}</span>}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

/** Card with a title row and an optional link or actions on the right. */
export function Panel({ title, subtitle, action, children, className = '' }) {
  return (
    <section className={`card overflow-hidden ${className}`}>
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
        <div>
          <h2 className="h2">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function PanelLink({ href, children }) {
  return <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700">{children}<Icon name="arrowRight" className="h-3.5 w-3.5" /></Link>;
}

export function Empty({ children }) {
  return <div className="px-4 py-10 text-center text-sm text-slate-400">{children}</div>;
}

export function DateFilter({ action, date, extra }) {
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <Field label="Date (AD)">
        <input type="date" name="date" defaultValue={date} className="input" />
      </Field>
      {extra}
      <button className="btn-secondary">Show</button>
    </form>
  );
}
