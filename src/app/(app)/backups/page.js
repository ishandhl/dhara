import { requireView } from '@/lib/auth';
import { fmtDateTime } from '@/lib/dates';
import { num } from '@/lib/format';
import { backupStatus, fmtBytes, BACKUP_MAX_AGE_HOURS } from '@/lib/backups';
import { PageHeader, Stat, Panel, Empty, Flash } from '@/components/ui';
import Icon from '@/components/Icon';
import { restoreFromFile } from './actions';

export default async function BackupsPage({ searchParams }) {
  const sp = await searchParams;
  const user = await requireView('backups');
  const owner = user.role === 'ADMIN';
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

      <Flash sp={sp} />

      <Panel className="mb-5" title="Your own backup file" subtitle="Download all the data to this computer at any time, and upload it again later if something goes wrong.">
        {owner ? (
          <div className="grid gap-5 px-5 py-4 lg:grid-cols-2">
            <div>
              <h3 className="font-semibold text-slate-900">1. Download</h3>
              <p className="mt-1 text-sm text-slate-600">Saves every record (QC, production, cold room, dispatch, store, users, settings) as one file, e.g. <code className="rounded bg-slate-100 px-1">dhara-backup-2083-07-12-1030.json.gz</code>. Keep it on a pen drive or in your email.</p>
              <a href="/backups/download" className="btn-primary mt-3"><Icon name="download" className="h-4 w-4" />Download backup file</a>
            </div>
            <form action={restoreFromFile} className="rounded-lg border border-red-200 bg-red-50/50 p-4">
              <h3 className="font-semibold text-slate-900">2. Upload (restore)</h3>
              <p className="mt-1 text-sm text-slate-600"><b className="text-red-700">This replaces all current data</b> with the data in the file. Anything entered after the file was downloaded will be lost. Download a fresh backup first if unsure.</p>
              <input type="file" name="file" accept=".gz,.json,application/gzip,application/json" required className="mt-3 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 file:ring-1 file:ring-slate-300" />
              <label className="mt-3 block">
                <span className="label">Type RESTORE to confirm</span>
                <input name="confirm" autoComplete="off" className="input max-w-[12rem] uppercase" placeholder="RESTORE" required />
              </label>
              <button className="btn-danger mt-3">Upload and restore</button>
            </form>
          </div>
        ) : (
          <p className="px-5 py-4 text-sm text-slate-600">Only the owner / admin can download or restore a backup file, because it contains every record and all user logins.</p>
        )}
      </Panel>

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
