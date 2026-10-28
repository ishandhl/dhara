// Restore an encrypted backup into a database.
//   node scripts/backup/restore.mjs <backup.dump.enc> <target-postgres-url> [--replace]
// Needs BACKUP_PASSPHRASE and PostgreSQL 17 tools (pg_restore). On this PC set PG_BIN to the folder
// that holds pg_restore.exe, e.g. %LOCALAPPDATA%\pgsql\bin
// Without --replace it only restores into an EMPTY database (safe test restore).
// With --replace it first drops everything in the target — only for a real recovery.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { decryptFile } from './crypt.mjs';

const [file, target] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const replace = process.argv.includes('--replace');
if (!file || !target) {
  console.error('Usage: node scripts/backup/restore.mjs <backup.dump.enc> <target-postgres-url> [--replace]');
  process.exit(2);
}
const bin = (name) => (process.env.PG_BIN ? join(process.env.PG_BIN, name) : name);

const prisma = new PrismaClient({ datasourceUrl: target });
const [{ n }] = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public'`);
if (n > 0 && !replace) {
  await prisma.$disconnect();
  console.error(`Target database already has ${n} tables. Restore into an empty database, or add --replace to wipe it first.`);
  process.exit(1);
}
if (replace) {
  console.log('Wiping the target database (schema public)…');
  await prisma.$executeRawUnsafe('DROP SCHEMA public CASCADE');
  await prisma.$executeRawUnsafe('CREATE SCHEMA public');
}
await prisma.$disconnect();

const dir = mkdtempSync(join(tmpdir(), 'dairy-restore-'));
const dump = join(dir, 'backup.dump');
try {
  console.log('Decrypting…');
  await decryptFile(file, dump);
  console.log('Restoring…');
  const r = spawnSync(bin('pg_restore'), ['--no-owner', '--no-acl', '--exit-on-error', '-d', target, dump], { stdio: 'inherit' });
  if (r.error) throw new Error(`Could not run pg_restore: ${r.error.message}. Set PG_BIN to the PostgreSQL bin folder.`);
  if (r.status !== 0) throw new Error(`pg_restore failed with code ${r.status}`);
  console.log('Restore finished.');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
