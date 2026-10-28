'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { canView, ROLE_LABELS } from '@/lib/roles';
import { logout } from '@/app/login/actions';
import Icon from './Icon';
import Logo from './Logo';

// Grouped the way the plant works through the day: milk in → production → cold room → stores → reports.
const GROUPS = [
  { title: null, links: [{ href: '/', label: 'Dashboard', icon: 'home', section: 'dashboard', exact: true }] },
  {
    title: 'Milk & production',
    links: [
      { href: '/receiving', label: 'Milk QC & Receiving', icon: 'flask', section: 'receiving' },
      { href: '/production', label: 'Production', icon: 'factory', section: 'production' },
      { href: '/silos', label: 'Silo Stock', icon: 'tank', section: 'silos' },
    ],
  },
  {
    title: 'Cold room',
    links: [
      { href: '/store', label: 'Cold Room Stock', icon: 'snow', section: 'store', exact: true },
      { href: '/dispatch', label: 'Dispatch (Market Going)', icon: 'truck', section: 'dispatch' },
      { href: '/store/entries', label: 'Return / Damage / Receipt', icon: 'swap', section: 'store' },
      { href: '/store/count', label: 'Daily Count', icon: 'check', section: 'store' },
    ],
  },
  { title: 'Stores', links: [{ href: '/general-store', label: 'General Store', icon: 'box', section: 'generalStore' }] },
  { title: 'Reports', links: [{ href: '/reports', label: 'Reports', icon: 'chart', section: 'reports' }] },
];
const SETUP = [
  { href: '/masters/products', label: 'Products' },
  { href: '/masters/packaging', label: 'General Store Items' },
  { href: '/masters/suppliers', label: 'Suppliers' },
  { href: '/masters/tankers', label: 'Tankers' },
  { href: '/masters/distributors', label: 'Distributors' },
  { href: '/masters/routes', label: 'Routes' },
  { href: '/masters/vehicles', label: 'Vehicles' },
  { href: '/masters/silos', label: 'Silos & Dip Charts' },
  { href: '/masters/loss-reasons', label: 'Loss Reasons' },
  { href: '/masters/settings', label: 'Tolerances & Settings' },
];

function isActive(path, l) {
  return l.exact ? path === l.href : path === l.href || path.startsWith(l.href + '/');
}

function Links({ user, path }) {
  const item = (active) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${active ? 'bg-white/10 font-medium text-white shadow-[inset_3px_0_0_#60a5fa]' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`;
  const setupOpen = path.startsWith('/masters') || path.startsWith('/users') || path.startsWith('/audit') || path.startsWith('/backups');
  return (
    <nav className="space-y-4">
      {GROUPS.map((g) => {
        const links = g.links.filter((l) => canView(user.role, l.section));
        if (!links.length) return null;
        return (
          <div key={g.title || 'main'}>
            {g.title && <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{g.title}</div>}
            <div className="space-y-0.5">
              {links.map((l) => (
                <Link key={l.href} href={l.href} className={item(isActive(path, l))}>
                  <Icon name={l.icon} className="h-[18px] w-[18px] shrink-0 opacity-80" />{l.label}
                </Link>
              ))}
            </div>
          </div>
        );
      })}
      {(canView(user.role, 'masters') || canView(user.role, 'users') || canView(user.role, 'audit')) && (
        <details className="group" open={setupOpen}>
          <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white">
            <Icon name="cog" className="h-[18px] w-[18px] opacity-80" />Setup &amp; admin
            <span className="ml-auto text-xs text-slate-500 transition group-open:rotate-90">▶</span>
          </summary>
          <div className="mt-0.5 space-y-0.5 border-l border-white/10 pl-3 ml-5">
            {canView(user.role, 'masters') && SETUP.map((l) => (
              <Link key={l.href} href={l.href} className={`block rounded-md px-3 py-1.5 text-[13px] ${path === l.href ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}>{l.label}</Link>
            ))}
            {canView(user.role, 'users') && <Link href="/users" className={`block rounded-md px-3 py-1.5 text-[13px] ${path === '/users' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}>Users</Link>}
            {canView(user.role, 'audit') && <Link href="/audit" className={`block rounded-md px-3 py-1.5 text-[13px] ${path === '/audit' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}>Audit Log</Link>}
            {canView(user.role, 'backups') && <Link href="/backups" className={`block rounded-md px-3 py-1.5 text-[13px] ${path === '/backups' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}>Backups</Link>}
          </div>
        </details>
      )}
    </nav>
  );
}

function UserBox({ user }) {
  return (
    <div className="flex items-center gap-3 border-t border-white/10 pt-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-sm font-semibold text-blue-200">{user.name.slice(0, 1).toUpperCase()}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-white">{user.name}</div>
        <div className="truncate text-xs text-slate-400">{ROLE_LABELS[user.role]}</div>
      </div>
      <form action={logout}>
        <button title="Log out" className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><Icon name="logout" className="h-4 w-4" /></button>
      </form>
    </div>
  );
}

function Brand({ bsToday }) {
  return (
    <Logo sub={`${bsToday} BS`} />
  );
}

export default function Nav({ user, bsToday }) {
  const path = usePathname();
  return (
    <>
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-slate-900 lg:flex">
        <div className="px-5 pb-4 pt-5"><Brand bsToday={bsToday} /></div>
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <Links user={user} path={path} />
        </div>
        <div className="px-5 pb-5"><UserBox user={user} /></div>
      </aside>
      <header className="sticky top-0 z-20 bg-slate-900 lg:hidden">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
            <Brand bsToday={bsToday} />
            <span className="rounded-md border border-white/20 px-2.5 py-1 text-sm text-white">Menu</span>
          </summary>
          <div className="max-h-[80vh] space-y-4 overflow-y-auto px-3 pb-4">
            <Links user={user} path={path} />
            <UserBox user={user} />
          </div>
        </details>
      </header>
    </>
  );
}
