import { currentUser } from '@/lib/auth';
import { todayISO, bs } from '@/lib/dates';
import { exportAll } from '@/lib/dataBackup';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// Owner-only: the file holds every record, including users' password hashes.
export async function GET() {
  const user = await currentUser();
  if (!user || user.role !== 'ADMIN') return new Response('Only the owner / admin can download a backup', { status: 403 });
  const { buf, rows } = await exportAll();
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kathmandu', hour: '2-digit', minute: '2-digit' }).format(new Date()).replace(':', '');
  const name = `storesync-backup-${bs(todayISO())}-${time}.json.gz`;
  await audit({ userId: user.id, action: 'BACKUP_DOWNLOAD', entity: 'backup', after: { file: name, rows } });
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  });
}
