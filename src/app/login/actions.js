'use server';
import bcrypt from 'bcryptjs';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { createSession, destroySession } from '@/lib/auth';
import { audit } from '@/lib/audit';

// Password guessing protection: wrong tries within the window lock further logins until it passes.
// The address limit is higher because everyone at the plant shares one internet address.
const MAX_FAILS_USER = 5;
const MAX_FAILS_IP = 30;
const WINDOW_MIN = 15;

async function clientIp() {
  const h = await headers();
  return (h.get('x-nf-client-connection-ip') || h.get('x-forwarded-for') || '').split(',')[0].trim() || null;
}

export async function login(formData) {
  const username = String(formData.get('username') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  const ip = await clientIp();
  const since = new Date(Date.now() - WINDOW_MIN * 60 * 1000);
  const [userFails, ipFails] = await Promise.all([
    prisma.loginAttempt.count({ where: { ok: false, createdAt: { gte: since }, username } }),
    ip ? prisma.loginAttempt.count({ where: { ok: false, createdAt: { gte: since }, ip } }) : 0,
  ]);
  if (userFails >= MAX_FAILS_USER || ipFails >= MAX_FAILS_IP) {
    redirect('/login?error=' + encodeURIComponent(`Too many wrong tries. Wait ${WINDOW_MIN} minutes, or ask the admin to reset the password.`));
  }
  const user = await prisma.user.findUnique({ where: { username } });
  const ok = !!user && user.active && (await bcrypt.compare(password, user.passwordHash));
  await prisma.loginAttempt.create({ data: { username, ip, ok } });
  if (!ok) {
    await audit({ userId: user?.id ?? null, action: 'LOGIN_FAILED', entity: 'User', entityId: user?.id ?? null, after: { username, ip } });
    redirect('/login?error=' + encodeURIComponent('Wrong username or password'));
  }
  await createSession(user);
  await audit({ userId: user.id, action: 'LOGIN', entity: 'User', entityId: user.id, after: { ip } });
  redirect('/');
}

export async function logout() {
  await destroySession();
  redirect('/login');
}
