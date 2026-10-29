import { BRAND } from '@/lib/brand';

// StoreSync mark: a milk drop inside two sync arrows. Same drawing as src/app/icon.svg.
export function LogoMark({ className = 'h-9 w-9' }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#2563eb" />
      <g fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round">
        <path d="M15.6 27.6A17 17 0 0 1 40.5 17.3" />
        <path d="M48.4 36.4A17 17 0 0 1 23.5 46.7" />
      </g>
      <path d="M45 20.2 38.2 21.4 42.3 13.4Z" fill="#fff" />
      <path d="M19 43.8 25.8 42.6 21.7 50.6Z" fill="#fff" />
      <path d="M32 23.5C32 23.5 25.8 30.8 25.8 34.8a6.2 6.2 0 0 0 12.4 0C38.2 30.8 32 23.5 32 23.5Z" fill="#bfdbfe" />
    </svg>
  );
}

export default function Logo({ sub, dark = true, size = 'h-9 w-9' }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark className={`${size} shrink-0`} />
      <div>
        <div className={`text-[17px] font-bold leading-tight tracking-tight ${dark ? 'text-white' : 'text-slate-900'}`}>{BRAND.name}</div>
        {sub && <div className={`text-[11px] ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{sub}</div>}
      </div>
    </div>
  );
}
