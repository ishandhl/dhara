// Print {table: rows} for every table in the public schema of a database, as JSON.
//   node scripts/backup/row-counts.mjs <postgres-url>
// Used to prove a backup restores completely: counts before the dump vs. counts after restoring it.
import { PrismaClient } from '@prisma/client';

const url = process.argv[2];
if (!url) { console.error('Usage: node scripts/backup/row-counts.mjs <postgres-url>'); process.exit(2); }

const prisma = new PrismaClient({ datasourceUrl: url });
try {
  const tables = await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`);
  const counts = {};
  for (const { tablename } of tables) {
    const [{ n }] = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${tablename.replace(/"/g, '""')}"`);
    counts[tablename] = n;
  }
  console.log(JSON.stringify(counts));
} finally {
  await prisma.$disconnect();
}
