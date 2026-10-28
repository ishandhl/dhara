// Record the result of a backup run in the app database (shown on the Backups page).
//   node scripts/backup/record.mjs OK|FAILED
// Reads: DIRECT_URL, BACKUP_STARTED, BACKUP_NAME, BACKUP_FILE, BACKUP_ROWS, BACKUP_LOCATION, BACKUP_NOTE
import { statSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const status = process.argv[2];
if (!['OK', 'FAILED'].includes(status)) { console.error('Usage: record.mjs OK|FAILED'); process.exit(2); }
const e = process.env;
let sizeBytes = null;
try { if (e.BACKUP_FILE) sizeBytes = statSync(e.BACKUP_FILE).size; } catch { /* file may not exist on failure */ }

const prisma = new PrismaClient({ datasourceUrl: e.DIRECT_URL });
try {
  await prisma.backupRun.create({
    data: {
      startedAt: e.BACKUP_STARTED ? new Date(e.BACKUP_STARTED) : new Date(),
      status,
      fileName: e.BACKUP_NAME || null,
      sizeBytes,
      rowCount: e.BACKUP_ROWS ? Number(e.BACKUP_ROWS) : null,
      verified: status === 'OK' && !!e.BACKUP_ROWS,
      location: e.BACKUP_LOCATION || null,
      note: e.BACKUP_NOTE || null,
    },
  });
  console.log(`Recorded backup run: ${status}`);
} finally {
  await prisma.$disconnect();
}
