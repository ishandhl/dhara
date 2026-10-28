# Backups and restoring

## What protects the data

| Layer | Covers | Kept |
|---|---|---|
| **Cancel with reason** (in the app) | A wrong entry | Forever (audit log) |
| **Neon point-in-time restore** | A big mistake noticed the same day | Last 6 hours |
| **Nightly backup → Google Drive** | Anything older, or losing the Neon project | 31 daily + 13 monthly copies |
| **GitHub artifact** | Second copy of the last 7 nights | 7 days |
| **Code on GitHub** + secrets in a password manager | Rebuilding the whole system | Forever |

Every nightly backup is **restored into a scratch database and its row counts checked** before it is uploaded, so a green run means the file really works. Files are encrypted (AES-256) with `BACKUP_PASSPHRASE`.

## Daily / monthly checks

- **Daily (automatic):** a manager sees a red alert on the dashboard if last night's backup failed or is late.
- **Monthly (2 minutes):** Setup & admin → **Backups**: last runs all "OK"; Google Drive `DharaBackups/daily` has ~31 files.
- **Every 3 months:** do a test restore (below, option B). Write the date in the audit notebook.

## Option A — undo a mistake from the last 6 hours (Neon)

1. Neon console → project → **Restore** (or Branches → Restore).
2. Pick the time just **before** the mistake, restore to a **new branch** first and check it with the app's connection string if unsure.
3. When happy, restore the main branch to that time. Everything entered after that time is lost, so note what to re-enter.

## Option B — restore a nightly backup

You need: the backup file, the passphrase, and PostgreSQL 17 tools on this PC (`%LOCALAPPDATA%\pgsql\bin` already has them).

1. Download the file from Google Drive `DharaBackups/daily` (or `monthly`), e.g. `dairy-2026-10-28-0215.dump.enc`.
2. **Test restore** (safe — into a new empty database). In Neon, create a new branch/database, or locally:

```powershell
$env:PG_BIN = "$env:LOCALAPPDATA\pgsql\bin"
$env:PGPASSWORD = 'postgres'
& "$env:PG_BIN\createdb.exe" -U postgres -h localhost dairy_restore
$env:BACKUP_PASSPHRASE = '<the passphrase>'
npm run backup:restore -- "C:\path\dairy-2026-10-28-0215.dump.enc" "postgresql://postgres:postgres@localhost:5432/dairy_restore"
```

   Point a local copy of the app at `dairy_restore` to look at the data.

3. **Real recovery** (replaces the live data): use the Neon **direct** connection string as the target and add `--replace`:

```powershell
npm run backup:restore -- "C:\path\backup.dump.enc" "<Neon direct connection string>" --replace
```

   Without `--replace` the script refuses to touch a database that already has tables.

## Option C — the whole system is gone

1. New Neon project (DEPLOY.md step 1).
2. Restore the latest backup into it (option B, step 3 — the new database is empty, so no `--replace`).
3. New Netlify site from the GitHub repo with the new connection strings and the **same** `AUTH_SECRET` (DEPLOY.md step 4).
4. Update the GitHub secret `DIRECT_URL`, then run the backup workflow once.

## Just open a backup file

```powershell
$env:BACKUP_PASSPHRASE = '<the passphrase>'
npm run backup:decrypt -- backup.dump.enc backup.dump
```

`backup.dump` is a standard PostgreSQL custom-format dump (`pg_restore --list backup.dump` shows its contents).
