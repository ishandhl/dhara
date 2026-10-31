import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { UserError } from './forms';
import { prisma } from './db';
import { COOKIE, signSession, verifySession } from './session';
import { canEdit, canView } from './roles';

export async function createSession(user) {
  const token = await signSession({ uid: user.id, role: user.role, name: user.name });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

/** Current user (fresh from DB so deactivated users are locked out at once). */
export async function currentUser() {
  const payload = await verifySession((await cookies()).get(COOKIE)?.value);
  if (!payload?.uid) return null;
  const user = await prisma.user.findUnique({ where: { id: Number(payload.uid) } });
  if (!user || !user.active) return null;
  return user;
}

/** Require login and view access to a section; returns the user. */
export async function requireView(section) {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (section && !canView(user.role, section)) redirect('/?error=' + encodeURIComponent('You do not have access to that page'));
  return user;
}

/** Require edit access (use inside server actions). */
export async function requireEdit(section) {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!canEdit(user.role, section)) throw new UserError('You do not have permission to do this');
  return user;
}
