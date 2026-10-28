# Dhara — dairy operations (milk QC, production, cold room & stores)

Multi-user web app for a milk processing plant. **Phase 1 + 2 are built:**

- Login with roles (Owner/Admin, Plant Manager, Receiving/QC, Production, Store, Dispatch, Accounts)
- Masters: products, silos with dip charts and correction factor, suppliers, tankers, routes, distributors, vehicles, packaging items with bill of materials, loss reasons, tolerances, milk density
- **Milk receiving** in 3 steps: gate entry → QC test (accept/reject) → unload into silo by dip reading (cm → litres via dip chart × correction factor) or direct litres. Shows the difference vs the supplier's quantity with a green / amber / red flag, plus kg fat and kg SNF.
- **Silo stock**: live stock with weighted fat/SNF, closing/check dip readings vs system stock, transfers, manager adjustments, full ledger per silo
- **Production batches**: milk issued from silos, standardised fat/SNF, output per product (expiry set automatically from shelf life), process loss by reason, by-products, packaging used vs expected. Yield, unexplained loss and fat balance. Closing a batch locks it and posts stock to finished goods.
- **Finished goods stock** by product and batch, oldest expiry first
- Dashboard, audit log of every change, Nepali (BS) dates on every screen

No deletes: wrong entries are cancelled with a reason by a Manager, and stock is reversed with a ledger entry.

**Phase 3 — cold room & general store (built):**

- **Cold room stock** by product and lot, FIFO by expiry. Quantities can be decimals for kg / litre products.
- **Dispatch challans** (Market Going): draft → add products → dispatch takes stock out oldest-expiry first; printable challan; manager cancel puts stock back.
- **Receipt / Return / Damage**: receipts not made through a batch, market returns (sellable or straight to damage), used / damage with a reason, opening stock (manager).
- **Daily count** (Count Record of Coldroom): count every product, see the difference, manager books it as an adjustment.
- **General store**: packaging, cups & lids, plastic, chemicals, lab, spare parts, stationery — receive, issue to a department, physical count, reorder levels. Packaging used in closed batches is taken out automatically.
- **Reports**: Cold Room Record in the same layout as the Excel sheet (opening, production, market going, market return, used/damage, stock, count, different, remarks) for a day or any period, and a General Store report. Both print and download as Excel (one sheet per day for a period).

Coming next: day closing with the four balances, more reports.

**User guide:** [docs/Dhara-How-to-Use.pdf](docs/Dhara-How-to-Use.pdf) — step-by-step for every role, with screenshots.

## Stack

Next.js 15 (App Router, server actions) · PostgreSQL · Prisma 6 · Tailwind CSS. Plain JavaScript.

## Run locally

```bash
cp .env.example .env          # set DATABASE_URL and AUTH_SECRET
npm install
npx prisma migrate deploy     # create tables
npm run db:seed -- --demo     # admin + demo users + products from the Coldroom Record sheet + one demo day
npm run dev                   # http://localhost:3000
```

Logins after seeding: `admin` / `admin123` (change it at once in Users).
With `--demo`: `manager`, `qc`, `production`, `store`, `dispatch`, `accounts` — password `dairy123`. Deactivate these before going live.

## Deploy to the cloud

**Option A — Vercel + Neon or Supabase (least maintenance)**

1. Create a Postgres database on Neon or Supabase and copy its connection string. Pick a region close to Nepal (for example Singapore or Mumbai).
2. Push this folder to a private GitHub repo and import it in Vercel.
3. In Vercel → Settings → Environment Variables, set `DATABASE_URL` and `AUTH_SECRET` (`openssl rand -base64 48`). Set the Vercel function region to match the database.
4. Run once from your machine against the production database:
   `DATABASE_URL=... npx prisma migrate deploy && DATABASE_URL=... npm run db:seed`
5. Open the site, log in as `admin`, change the password, and replace the sample masters with your real data.

**Option B — your own VPS (Ubuntu)**

```bash
sudo apt install postgresql nginx
# create database + user, then:
npm ci && npx prisma migrate deploy && npm run db:seed && npm run build
npx pm2 start "npm start" --name dairy     # runs on port 3000
```

Put Nginx in front with HTTPS (Let's Encrypt), and back up Postgres daily (`pg_dump` to cloud storage).

## Set up for your plant

1. **Masters → Products**: replace the sample list. `Litres per unit` drives litre totals (500 ml packet = 0.5).
2. **Masters → Silos**: real capacities, then open each silo → **Dip chart** and paste `cm litres` pairs from your calibration sheet. Use **Test a reading** to check.
3. **Correction factor**: when a tanker is weighed, set factor = weighbridge litres ÷ dip litres.
4. **Masters → Settings**: tolerance limits and milk density.
5. **Users**: one login per person with the right role.

## Code map

```
prisma/schema.prisma        database (ledgers: SiloMovement, StockLedger, PackagingLedger)
prisma/seed.mjs             starter data
src/lib/                    auth, roles, dates (BS), dip chart maths, stock, batch summary, tolerances
src/app/(app)/receiving     tanker receiving
src/app/(app)/silos         silo stock, dips, transfers
src/app/(app)/production    batches
src/app/(app)/store         finished goods stock
src/app/(app)/masters       generic master screens (config in src/lib/masters.js)
src/app/(app)/users, audit  admin
```

Role permissions live in `src/lib/roles.js`.
