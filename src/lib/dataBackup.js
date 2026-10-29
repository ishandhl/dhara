// "Download all data" / "Upload a backup file" from the Backups page.
// The file is gzipped JSON: every table except login attempts and the nightly-backup log.
// Restoring replaces the data in one transaction, so it either fully works or changes nothing.
import { gzipSync, gunzipSync } from 'node:zlib';
import { Prisma } from '@prisma/client';
import { prisma } from './db';

export const FORMAT = 'dhara-backup';
export const VERSION = 1;
const SKIP = new Set(['LoginAttempt', 'BackupRun']);

/** Models in insert order: a table comes after every table it points to. */
function orderedModels() {
  const models = Prisma.dmmf.datamodel.models.filter((m) => !SKIP.has(m.name));
  const deps = Object.fromEntries(models.map((m) => [m.name, m.fields.filter((f) => f.relationFromFields?.length && f.type !== m.name).map((f) => f.type)]));
  const done = [];
  const visit = (name, path = []) => {
    if (done.includes(name) || !deps[name]) return;
    if (path.includes(name)) throw new Error(`Circular relation at ${name}`);
    for (const d of deps[name]) visit(d, [...path, name]);
    done.push(name);
  };
  for (const m of models) visit(m.name);
  return done.map((name) => models.find((m) => m.name === name));
}

const delegate = (name) => prisma[name.charAt(0).toLowerCase() + name.slice(1)];

async function latestMigration(db = prisma) {
  const rows = await db.$queryRaw`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name DESC LIMIT 1`;
  return rows[0]?.migration_name || null;
}

/** Whole database as a gzipped JSON buffer, plus row counts. */
export async function exportAll() {
  const tables = {};
  const counts = {};
  for (const m of orderedModels()) {
    tables[m.name] = await delegate(m.name).findMany({ orderBy: m.fields.some((f) => f.name === 'id') ? { id: 'asc' } : undefined });
    counts[m.name] = tables[m.name].length;
  }
  const doc = { format: FORMAT, version: VERSION, schema: await latestMigration(), createdAt: new Date().toISOString(), counts, tables };
  const buf = gzipSync(Buffer.from(JSON.stringify(doc)));
  return { buf, counts, rows: Object.values(counts).reduce((a, b) => a + b, 0) };
}

/** Read and check an uploaded file. Throws a readable Error if it is not a usable backup. */
export async function readBackup(bytes) {
  let doc;
  try {
    const raw = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
    doc = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new Error('This is not a Dhara backup file (could not read it).');
  }
  if (doc?.format !== FORMAT || !doc.tables) throw new Error('This is not a Dhara backup file.');
  if (doc.version !== VERSION) throw new Error(`Backup file version ${doc.version} is not supported.`);
  const current = await latestMigration();
  if (doc.schema !== current) throw new Error(`This backup was made with a different version of the app (${doc.schema}); this app is at ${current}. Restore it with the nightly-backup tools instead.`);
  for (const m of orderedModels()) if (!Array.isArray(doc.tables[m.name])) throw new Error(`Backup file is missing the ${m.name} table.`);
  return doc;
}

/** Replace all data with the backup's. Returns the number of rows written. */
export async function restoreAll(doc) {
  const models = orderedModels();
  const jsonFields = Object.fromEntries(models.map((m) => [m.name, m.fields.filter((f) => f.type === 'Json').map((f) => f.name)]));
  let written = 0;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`TRUNCATE ${models.map((m) => `"${m.name}"`).join(', ')} RESTART IDENTITY CASCADE`);
    for (const m of models) {
      const rows = doc.tables[m.name].map((r) => {
        const out = { ...r };
        for (const f of jsonFields[m.name]) if (out[f] === null) out[f] = Prisma.DbNull;
        return out;
      });
      for (let i = 0; i < rows.length; i += 1000) {
        written += (await tx[m.name.charAt(0).toLowerCase() + m.name.slice(1)].createMany({ data: rows.slice(i, i + 1000) })).count;
      }
      // Next new record continues after the highest restored id.
      if (m.fields.some((f) => f.name === 'id' && f.default?.name === 'autoincrement')) {
        await tx.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"${m.name}"', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM "${m.name}"`);
      }
    }
  }, { timeout: 60000, maxWait: 10000 });
  return written;
}
