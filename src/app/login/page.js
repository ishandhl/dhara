import { login } from './actions';
import Logo from '@/components/Logo';

export const metadata = { title: 'Log in' };

export default async function LoginPage({ searchParams }) {
  const sp = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo size="h-12 w-12" sub="Milk QC · production · cold room · stores" />
        </div>
        <form action={login} className="card space-y-4 p-6 shadow-xl">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Log in</h1>
            <p className="muted">Use your own username so your entries are recorded under your name.</p>
          </div>
          {sp?.error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{sp.error}</div>}
          <label className="block">
            <span className="label">Username</span>
            <input name="username" autoComplete="username" autoCapitalize="none" className="input" required autoFocus />
          </label>
          <label className="block">
            <span className="label">Password</span>
            <input name="password" type="password" autoComplete="current-password" className="input" required />
          </label>
          <button className="btn-primary w-full py-2.5">Log in</button>
        </form>
      </div>
    </div>
  );
}
