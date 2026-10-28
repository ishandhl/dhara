import { requireView } from '@/lib/auth';
import { fmtDateTime } from '@/lib/dates';
import { num } from '@/lib/format';
import { backupStatus, fmtBytes, BACKUP_MAX_AGE_HOURS } from '@/lib/backups';
import { PageHeader, Stat, Panel, Empty } from '@/components/ui';

export default async function BackupsPage() {
  await requireView('backups');
  const { runs, last, lastOk, ageHours, healthy } = await backupStatus();
  const ago = ageHours === null ? null : ageHours < 1 ? 'less than an hour ago' : ageHours < 48 ? `${Math.round(ageHours)} hours ago` : `${Math.round(ageHours / 24)} days ago`;

  return (
    <div>
      <PageHeader title="Backups" subtitle="A full copy of the database is made every night at 02:00 (Nepal time), checked by restoring it, encrypted and saved to Google Drive." />

      {!healthy && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <b>Backup needs attention.</b>{' '}
          {!lastOk ? 'No successful backup has been recorded yet.' : last.status === 'FAILED' ? 'The last backup failed.' : `The last good backup was ${ago} (more than ${BACKUP_MAX_AGE_HOURS} hours).`}{' '}
          Open GitHub → the repository → Actions → “Nightly database backup” to see why, or press “Run workflow” to try again now.
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={healthy ? 'check' : 'alert'} tone={healthy ? 'green' : 'red'} label="Backup status" value={healthy ? 'OK' : 'Check'} sub={lastOk ? `last good backup ${ago}` : 'no backup yet'} />
        <Stat icon="clock" tone="blue" label="Last good backup" value={lastOk ? fmtDateTime(lastOk.finishedAt).split(' ')[1] : '–'} sub={lastOk ? fmtDateTime(lastOk.finishedAt) : 'runs nightly at 02:00'} />
        <Stat icon="drop" tone="violet" label="Rows in last backup" value={lastOk?.rowCount ? num(lastOk.rowCount) : '–'} sub={lastOk?.verified ? 'restored and checked ✓' : 'not verified'} />
        <Stat icon="download" tone="slate" label="Backup file size" value={fmtBytes(lastOk?.sizeBytes)} sub={lastOk?.location || 'Google Drive'} />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Recent backups" subtitle="Daily copies are kept 31 days; the copy made on the 1st of each month is kept about 13 months.">
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Finished</th><th>Status</th><th>File</th><th className="num">Size</th><th className="num">Rows</th><th>Checked</th></tr></thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap text-xs">{fmtDateTime(r.finishedAt)}</td>
                    <td>{r.status === 'OK' ? <span className="badge bg-emerald-100 text-emerald-800">OK</span> : <span className="badge bg-red-100 text-red-800">Failed</span>}</td>
                    <td className="text-xs">{r.fileName || '–'}{r.note && <div className="text-slate-500">{r.note}</div>}</td>
                    <td className="num">{fmtBytes(r.sizeBytes)}</td>
                    <td className="num">{r.rowCount ? num(r.rowCount) : '–'}</td>
                    <td>{r.verified ? <span className="text-emerald-700">✓ restored</span> : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!runs.length && <Empty>No backups recorded yet. They start once the GitHub backup job is set up (see docs/DEPLOY.md).</Empty>}
          </div>
        </Panel>
        <Panel title="How backups protect the data">
          <ul className="space-y-3 px-5 py-4 text-sm text-slate-600">
            <li><b className="text-slate-800">Mistake in the last 6 hours?</b> Neon can rewind the database to any minute in the last 6 hours (Neon console → Restore).</li>
            <li><b className="text-slate-800">Older problem or lost database?</b> Restore a nightly copy from Google Drive with <code className="rounded bg-slate-100 px-1">scripts/backup/restore.mjs</code> — steps in docs/BACKUP-RESTORE.md.</li>
            <li><b className="text-slate-800">Wrong entry?</b> No need to restore — a manager cancels the entry with a reason.</li>
            <li><b className="text-slate-800">Keep the backup passphrase safe.</b> Backups are encrypted; without the passphrase they cannot be opened.</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
