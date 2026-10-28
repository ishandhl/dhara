import { BRAND } from '@/lib/brand';

// Dhara mark: a milk drop holding Himalayan peaks. Same drawing as src/app/icon.svg.
export function LogoMark({ className = 'h-9 w-9' }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#2563eb" />
      <path d="M32 9C32 9 15 29.5 15 41a17 17 0 0 0 34 0C49 29.5 32 9 32 9Z" fill="#fff" />
      <path d="M17.6 49.2 26 38.5l3.6 4.4 6-8.4 10.8 14.7A17 17 0 0 1 17.6 49.2Z" fill="#1d4ed8" />
      <path d="m35.6 34.5 2.6 3.5-2.6-1-1.8 1.4Z" fill="#fff" />
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
