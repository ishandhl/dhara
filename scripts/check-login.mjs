// Diagnoses a failing login on the live database. Prints no secrets.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const users = await prisma.user.findMany({ select: { username: true, role: true, active: true, passwordHash: true } });
for (const u of users) {
  const fileMatch = u.username === 'admin' && process.env.ADMIN_PASSWORD ? await bcrypt.compare(process.env.ADMIN_PASSWORD, u.passwordHash) : '-';
  console.log(`user ${u.username} role ${u.role} active ${u.active} password-in-file-works ${fileMatch}`);
}
const since = new Date(Date.now() - 24 * 3600 * 1000);
const attempts = await prisma.loginAttempt.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: 15, select: { username: true, ok: true, createdAt: true } });
for (const a of attempts) console.log(`attempt ${a.createdAt.toISOString()} user "${a.username}" ok ${a.ok}`);
await prisma.$disconnect();
