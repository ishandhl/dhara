import { redirect } from 'next/navigation';
import Nav from '@/components/Nav';
import { currentUser } from '@/lib/auth';
import { bs, todayISO } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  return (
    <div>
      <Nav user={{ name: user.name, role: user.role }} bsToday={bs(todayISO())} />
      <main className="px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 lg:ml-64 lg:px-8 lg:py-7">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
