'use server';
import { revalidatePath } from 'next/cache';
import { currentUser } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { run, UserError, str } from '@/lib/forms';
import { num } from '@/lib/format';
import { readBackup, restoreAll } from '@/lib/dataBackup';

export async function restoreFromFile(formData) {
  const back = '/backups';
  await run(back, async () => {
    const user = await currentUser();
    if (!user || user.role !== 'ADMIN') throw new UserError('Only the owner / admin can restore a backup');
    if (str(formData, 'confirm').toUpperCase() !== 'RESTORE') throw new UserError('Type RESTORE in the box to confirm');
    const file = formData.get('file');
    if (!file || typeof file === 'string' || !file.size) throw new UserError('Choose the backup file first');
    let doc;
    try { doc = await readBackup(Buffer.from(await file.arrayBuffer())); } catch (e) { throw new UserError(e.message); }
    const rows = await restoreAll(doc);
    // Written after the restore so this record survives it. The backup may not contain this user.
    const stillThere = doc.tables.User.some((u) => u.id === user.id);
    await audit({ userId: stillThere ? user.id : null, action: 'BACKUP_RESTORE', entity: 'backup', after: { file: file.name, madeAt: doc.createdAt, rows } });
    revalidatePath('/', 'layout');
    return `${back}?ok=${encodeURIComponent(`Restored ${num(rows)} records from ${file.name}`)}`;
  });
}
