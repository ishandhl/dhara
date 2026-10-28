# Deploying Dhara (free hosting)

| Part | Service | Free plan notes |
|---|---|---|
| App | **Netlify** | Business use allowed. HTTPS included. |
| Database | **Neon** Postgres, Singapore | ~100 compute-hours/month, 0.5–1 GB storage, 6-hour restore window. Sleeps after 5 minutes idle. |
| Code + nightly backup job | **GitHub** (private repo) | Actions minutes are plenty for one nightly job. |
| Backup copies | **Google Drive** (your account) | Encrypted files in `DharaBackups/`. |

Keep every password and key below in a password manager (e.g. Bitwarden, free). You need them to rebuild the system.

---

## 1. Neon database

1. Sign up at neon.com (log in with GitHub is fine).
2. **New project** → name `dairy-store`, Postgres **17**, region **AWS Asia Pacific (Singapore)**.
3. **Project settings → Compute**: set the size to **0.25 CU minimum and 0.25 CU maximum**. Bigger sizes use the 100 free hours up to 8× faster.
4. **Connect** → copy two connection strings:
   - **Pooled** (host contains `-pooler`) → this is `DATABASE_URL`. Add `&pgbouncer=true&connect_timeout=15` to the end.
   - **Direct** (turn "Connection pooling" off) → this is `DIRECT_URL`. Add `&connect_timeout=15`.

## 2. Create the tables and the admin user (once, from this PC)

Create a file `.env.production.local` in the project folder (it is git-ignored):

```
DATABASE_URL="<pooled string>"
DIRECT_URL="<direct string>"
ADMIN_PASSWORD="<a strong password, 10+ characters>"
```

Then in PowerShell, in the project folder:

```powershell
Get-Content .env.production.local | ForEach-Object { if ($_ -match '^(\w+)="?(.*?)"?$') { Set-Item "env:$($matches[1])" $matches[2] } }
npx prisma migrate deploy
npm run db:seed -- --production
```

This creates every table, the `admin` user with your password, the product list, general store items, loss reasons and settings. No demo data.

## 3. GitHub (private repository)

1. github.com → **New repository** → name `dairy-store` → **Private** → Create (no README).
2. Push the code from this PC (Git must be installed):

```powershell
git remote add origin https://github.com/<you>/dairy-store.git
git push -u origin main
```

## 4. Netlify (the app)

1. Sign up at netlify.com with GitHub.
2. **Add new project → Import an existing project → GitHub →** `dairy-store`.
3. Build settings are read from `netlify.toml` (nothing to change).
4. **Environment variables** — add:

| Key | Value |
|---|---|
| `DATABASE_URL` | Neon pooled string |
| `DIRECT_URL` | Neon direct string |
| `AUTH_SECRET` | 48+ random characters (PowerShell: `[Convert]::ToBase64String((1..48 \| % {Get-Random -Max 256}))`) |

5. **Deploy**. Each deploy runs `prisma migrate deploy`, so new database changes are applied automatically.
6. Open the site address (e.g. `https://dairy-store.netlify.app`), log in as `admin`, and create a user for each person.
7. Optional: **Domain management** → add your own domain.

## 5. Nightly backups to Google Drive

### 5a. Give the backup job access to your Google Drive

On this PC (once):

```powershell
winget install Rclone.Rclone
rclone config create gdrive drive scope=drive.file
```

A browser opens: log in to the Google account that should hold the backups and allow access. `drive.file` lets rclone see **only the files it creates**, not the rest of your Drive.

Then print the config and copy all of it:

```powershell
rclone config file      # shows where rclone.conf is
Get-Content (rclone config file | Select-Object -Last 1)
```

### 5b. Add the secrets to GitHub

GitHub → repository → **Settings → Secrets and variables → Actions → New repository secret**:

| Name | Value |
|---|---|
| `DIRECT_URL` | Neon **direct** connection string |
| `BACKUP_PASSPHRASE` | A long passphrase (5+ random words). **Write it down offline too** — without it no backup can be opened. |
| `RCLONE_CONFIG` | The whole content of `rclone.conf` |

### 5c. Test it

GitHub → **Actions → Nightly database backup → Run workflow**. In 2–3 minutes:
- the run is green,
- Google Drive has `DharaBackups/daily/dairy-<date>.dump.enc`,
- the app's **Setup & admin → Backups** page shows "OK" with the row count.

From then on it runs every night at 02:00 Nepal time. GitHub emails you if a run fails, and the dashboard shows a red "backup" alert to managers.

## 6. Uptime alert (optional, free)

uptimerobot.com → **New monitor** → HTTP(s) → `https://<your-site>/api/health` → every 5 minutes → your email.
Use `/api/health` **without** `?db=1`: checking the database every 5 minutes would stop Neon from sleeping and use up the free compute hours.

## 7. After go-live

- Deactivate the demo users if you copied any; change the admin password in Users if it was shared.
- Enter opening stock (cold room and general store), dated the day before go-live.
- Once a month: open **Backups** and check the last 30 nights are green; once every 3 months do a test restore (docs/BACKUP-RESTORE.md).
- Neon console → **Usage**: if compute hours approach 100 in a month, move to Neon's paid Launch plan (pay for use) — the app needs no change.
