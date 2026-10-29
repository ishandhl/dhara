'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { canView, canEdit, ROLE_LABELS } from '@/lib/roles';
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
      { href: '/silos', label: 'Milk Tank', icon: 'tank', section: 'silos' },
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

// ── Phone: bottom tabs picked for each role, a "+" sheet of quick entries, and a slide-in menu ──
const TAB = {
  receiving: { href: '/receiving', label: 'Milk QC', icon: 'flask', section: 'receiving' },
  production: { href: '/production', label: 'Production', icon: 'factory', section: 'production' },
  tank: { href: '/silos', label: 'Milk tank', icon: 'tank', section: 'silos' },
  store: { href: '/store', label: 'Cold room', icon: 'snow', section: 'store', exact: true },
  dispatch: { href: '/dispatch', label: 'Dispatch', icon: 'truck', section: 'dispatch' },
  general: { href: '/general-store', label: 'Store', icon: 'box', section: 'generalStore' },
  reports: { href: '/reports', label: 'Reports', icon: 'chart', section: 'reports' },
};
const ROLE_TABS = {
  ADMIN: ['receiving', 'reports', 'store'], MANAGER: ['receiving', 'reports', 'store'], QC: ['receiving', 'tank', 'production'],
  PRODUCTION: ['production', 'tank', 'general'], STORE: ['store', 'general', 'dispatch'], DISPATCH: ['dispatch', 'store', 'reports'],
  ACCOUNTS: ['reports', 'store', 'general'],
};
const QUICK = [
  { href: '/receiving/new', label: 'New milk QC entry', icon: 'flask', section: 'receiving' },
  { href: '/production', label: 'Open production batch', icon: 'factory', section: 'production' },
  { href: '/dispatch', label: 'New dispatch challan', icon: 'truck', section: 'dispatch' },
  { href: '/store/entries', label: 'Return / damage / receipt', icon: 'swap', section: 'store' },
  { href: '/store/count', label: 'Daily cold room count', icon: 'check', section: 'store' },
  { href: '/general-store', label: 'Issue / receive store item', icon: 'box', section: 'generalStore' },
  { href: '/silos', label: 'Milk tank reading', icon: 'tank', section: 'silos' },
];

function TabLink({ t, path }) {
  const active = isActive(path, t);
  return (
    <Link href={t.href} className={`flex flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium ${active ? 'text-blue-600' : 'text-slate-500'}`} aria-current={active ? 'page' : undefined}>
      <Icon name={t.icon} className="h-6 w-6" />{t.label}
    </Link>
  );
}

function MobileNav({ user, bsToday, path }) {
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState(false);
  const quick = QUICK.filter((q) => canEdit(user.role, q.section));
  const tabs = (ROLE_TABS[user.role] || []).map((k) => TAB[k]).filter((t) => canView(user.role, t.section)).slice(0, quick.length ? 2 : 3);

  // Close everything when the page changes; Esc closes too; the page behind doesn't scroll while open.
  useEffect(() => { setMenu(false); setSheet(false); }, [path]);
  useEffect(() => {
    const open = menu || sheet;
    document.body.style.overflow = open ? 'hidden' : '';
    const onKey = (e) => { if (e.key === 'Escape') { setMenu(false); setSheet(false); } };
    if (open) window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [menu, sheet]);

  return (
    <div className="lg:hidden">
      <header className="no-print sticky top-0 z-30 flex items-center gap-2 bg-slate-900 px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button onClick={() => setMenu(true)} aria-label="Open menu" aria-expanded={menu} className="rounded-lg p-2.5 text-white active:bg-white/10">
          <Icon name="menu" className="h-6 w-6" />
        </button>
        <Link href="/" className="min-w-0"><Brand bsToday={bsToday} /></Link>
        <div className="ml-auto flex h-9 w-9 items-center justify-center rounded-full bg-blue-500/20 text-sm font-semibold text-blue-200" title={user.name}>{user.name.slice(0, 1).toUpperCase()}</div>
      </header>

      {/* Slide-in menu */}
      <div className={`fixed inset-0 z-50 ${menu ? '' : 'pointer-events-none'}`} inert={!menu}>
        <div onClick={() => setMenu(false)} className={`absolute inset-0 bg-slate-950/60 transition-opacity duration-200 ${menu ? 'opacity-100' : 'opacity-0'}`} />
        <aside className={`absolute inset-y-0 left-0 flex w-[85%] max-w-xs flex-col bg-slate-900 shadow-2xl transition-transform duration-200 ${menu ? 'translate-x-0' : '-translate-x-full'}`} role="dialog" aria-label="Menu">
          <div className="flex items-center justify-between px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
            <Brand bsToday={bsToday} />
            <button onClick={() => setMenu(false)} aria-label="Close menu" className="rounded-lg p-2 text-slate-300 active:bg-white/10"><Icon name="close" className="h-6 w-6" /></button>
          </div>
          <div className="mobile-menu flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
            <Links user={user} path={path} />
          </div>
          <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"><UserBox user={user} /></div>
        </aside>
      </div>

      {/* Quick entry sheet */}
      <div className={`fixed inset-0 z-50 ${sheet ? '' : 'pointer-events-none'}`} inert={!sheet}>
        <div onClick={() => setSheet(false)} className={`absolute inset-0 bg-slate-950/60 transition-opacity duration-200 ${sheet ? 'opacity-100' : 'opacity-0'}`} />
        <div className={`absolute inset-x-0 bottom-0 rounded-t-2xl bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl transition-transform duration-200 ${sheet ? 'translate-y-0' : 'translate-y-full'}`} role="dialog" aria-label="New entry">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200" />
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">New entry</h2>
            <button onClick={() => setSheet(false)} aria-label="Close" className="rounded-lg p-2 text-slate-500 active:bg-slate-100"><Icon name="close" className="h-5 w-5" /></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {quick.map((q) => (
              <Link key={q.label} href={q.href} onClick={() => setSheet(false)} className="flex min-h-[64px] items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-800 active:bg-blue-50">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700"><Icon name={q.icon} className="h-5 w-5" /></span>
                {q.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom tabs */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur" aria-label="Main">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          <TabLink t={{ href: '/', label: 'Home', icon: 'home', exact: true }} path={path} />
          {tabs[0] && <TabLink t={tabs[0]} path={path} />}
          {quick.length ? (
            <button onClick={() => setSheet(true)} aria-label="New entry" className="flex flex-col items-center justify-center py-1">
              <span className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30 ring-4 ring-white active:bg-blue-700"><Icon name="plus" className="h-7 w-7" /></span>
              <span className="mt-0.5 text-[11px] font-medium text-slate-500">New</span>
            </button>
          ) : tabs[1] && <TabLink t={tabs[1]} path={path} />}
          {quick.length ? tabs[1] && <TabLink t={tabs[1]} path={path} /> : tabs[2] && <TabLink t={tabs[2]} path={path} />}
          <button onClick={() => setMenu(true)} className="flex flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium text-slate-500">
            <Icon name="menu" className="h-6 w-6" />Menu
          </button>
        </div>
      </nav>
    </div>
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
      <MobileNav user={user} bsToday={bsToday} path={path} />
    </>
  );
}
