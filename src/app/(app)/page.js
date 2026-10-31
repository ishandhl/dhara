import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireView } from '@/lib/auth';
import { canView, canEdit } from '@/lib/roles';
import { todayISO, toDateOnly, fmtDate, fmtTime, addDays, bs, isoOf } from '@/lib/dates';
import { num } from '@/lib/format';
import { productBatchStock, daysLeft, storeItemStocks, productStocks } from '@/lib/stock';
import { getTolerances, flag, getDensity } from '@/lib/tolerance';
import { batchSummary } from '@/lib/batch';
import { backupStatus } from '@/lib/backups';
import { tankStock } from '@/lib/milkTank';
import { Flash, Stat, StatusBadge, Panel, PanelLink, Empty } from '@/components/ui';
import BarChart from '@/components/BarChart';
import Icon from '@/components/Icon';

const ACCEPTED = ['ACCEPTED', 'UNLOADED'];

function Attention({ href, icon, tone, title, detail }) {
  const tones = { red: 'bg-red-50 text-red-600', amber: 'bg-amber-50 text-amber-600', blue: 'bg-blue-50 text-blue-600' };
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}><Icon name={icon} className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-slate-800">{title}</span>
          {detail && <span className="block truncate text-xs text-slate-500">{detail}</span>}
        </span>
        <Icon name="arrowRight" className="h-4 w-4 shrink-0 text-slate-300" />
      </Link>
    </li>
  );
}

function Quick({ href, icon, label }) {
  return (
    <Link href={href} className="flex min-h-[52px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] font-medium leading-tight text-slate-700 transition hover:border-blue-300 hover:text-blue-700 sm:gap-2.5 sm:whitespace-nowrap sm:px-3 sm:py-2.5 sm:text-sm">
      <Icon name={icon} className="h-4 w-4 shrink-0 text-blue-600" />{label}
    </Link>
  );
}

export default async function Dashboard({ searchParams }) {
  const sp = await searchParams;
  const user = await requireView('dashboard');
  const role = user.role;
  const today = todayISO();
  const d = toDateOnly(today);
  const weekStart = addDays(today, -6);
  const see = (s) => canView(role, s);

  const [receipts, batches, lots, products, density, tols, dispatchRows, receiptsWeek, draftChallans, storeItems, itemStocks, countsToday, stocks, tankL] = await Promise.all([
    prisma.milkReceipt.findMany({ where: { date: d }, include: { supplier: true }, orderBy: { id: 'desc' } }),
    prisma.batch.findMany({ where: { OR: [{ date: d }, { status: 'OPEN' }] }, include: { inputs: true, outputs: true, losses: true, byProducts: true } }),
    productBatchStock(),
    prisma.product.findMany(),
    getDensity(),
    getTolerances(),
    prisma.stockLedger.groupBy({ by: ['date', 'productId', 'type'], where: { date: { gte: toDateOnly(weekStart), lte: d }, type: { in: ['DISPATCH_OUT', 'RETURN_IN', 'DAMAGE'] } }, _sum: { qtyUnits: true } }),
    prisma.milkReceipt.groupBy({ by: ['date'], where: { date: { gte: toDateOnly(weekStart), lte: d }, status: { in: ACCEPTED } }, _sum: { supplierQtyL: true } }),
    see('dispatch') ? prisma.challan.findMany({ where: { status: 'DRAFT' }, orderBy: { id: 'asc' } }) : [],
    see('generalStore') ? prisma.packagingItem.findMany({ where: { active: true, reorderLevel: { not: null } } }) : [],
    see('generalStore') ? storeItemStocks() : {},
    prisma.stockCount.count({ where: { date: d } }),
    productStocks(),
    see('silos') ? tankStock() : null,
  ]);
  const productById = Object.fromEntries(products.map((p) => [p.id, p]));
  const litresOf = (productId, q) => q * (productById[productId]?.litresPerUnit || 1);

  // Milk QC today
  const accepted = receipts.filter((r) => ACCEPTED.includes(r.status));
  const rejected = receipts.filter((r) => r.status === 'REJECTED');
  const pendingQc = receipts.filter((r) => r.status === 'PENDING_QC');
  const milkL = accepted.reduce((a, r) => a + r.supplierQtyL, 0);
  const avg = (k) => (milkL ? accepted.reduce((a, r) => a + r.supplierQtyL * (r[k] || 0), 0) / milkL : null);
  const fat = avg('fatPct');
  const snf = avg('snfPct');

  // Production today
  const todays = batches.filter((b) => isoOf(b.date) === today && b.status !== 'CANCELLED');
  const sums = todays.map((b) => batchSummary(b, density));
  const allocL = sums.reduce((a, s) => a + s.inputL, 0);
  const packedL = sums.reduce((a, s) => a + s.packedL, 0);
  // Loss only means something once a batch is closed; an open batch is still being packed.
  const closedSums = todays.filter((b) => b.status === 'CLOSED').map((b) => batchSummary(b, density));
  const closedL = closedSums.reduce((a, s) => a + s.inputL, 0);
  const lossL = closedSums.reduce((a, s) => a + s.totalLossL, 0);
  const lossPct = closedL ? (lossL / closedL) * 100 : null;
  const openBatches = batches.filter((b) => b.status === 'OPEN');

  // Cold room today + last 7 days
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const perDay = (type) => days.map((day) => dispatchRows.filter((r) => isoOf(r.date) === day && r.type === type).reduce((a, r) => a + Math.abs(litresOf(r.productId, r._sum.qtyUnits || 0)), 0));
  const dispatched = perDay('DISPATCH_OUT');
  const returned = perDay('RETURN_IN');
  const damaged = perDay('DAMAGE');
  const milkWeek = days.map((day) => receiptsWeek.find((r) => isoOf(r.date) === day)?._sum.supplierQtyL || 0);
  const nearExpiry = lots.filter((l) => l.qty > 0 && l.expiryDate && daysLeft(l.expiryDate) <= 1);
  const negative = Object.entries(stocks).filter(([, q]) => q < -0.0001);
  const lowItems = storeItems.filter((i) => (itemStocks[i.id] || 0) <= i.reorderLevel);
  const backup = see('backups') ? await backupStatus(5) : null;

  const attention = [];
  if (see('receiving') && pendingQc.length) attention.push(<Attention key="qc" href="/receiving" icon="flask" tone="amber" title={`${pendingQc.length} tanker${pendingQc.length > 1 ? 's' : ''} waiting for QC`} detail={pendingQc.map((r) => `${r.receiptNo} · ${r.vehicleNo}`).join(', ')} />);
  const staleBatches = openBatches.filter((b) => isoOf(b.date) < today);
  if (see('production') && openBatches.length) attention.push(<Attention key="b" href={openBatches.length === 1 ? `/production/${openBatches[0].id}` : '/production'} icon="factory" tone={staleBatches.length ? 'red' : 'amber'} title={staleBatches.length ? `${staleBatches.length} batch${staleBatches.length > 1 ? 'es' : ''} from an earlier day still open — close ${staleBatches.length > 1 ? 'them' : 'it'}` : `${openBatches.length} production batch${openBatches.length > 1 ? 'es' : ''} still open`} detail={openBatches.map((b) => b.batchNo).join(', ')} />);
  if (see('dispatch') && draftChallans.length) attention.push(<Attention key="c" href={draftChallans.length === 1 ? `/dispatch/${draftChallans[0].id}` : '/dispatch'} icon="truck" tone="amber" title={`${draftChallans.length} challan${draftChallans.length > 1 ? 's' : ''} not dispatched`} detail={draftChallans.map((c) => c.challanNo).join(', ')} />);
  if (see('store') && nearExpiry.length) attention.push(<Attention key="e" href="/store" icon="clock" tone="red" title={`${nearExpiry.length} lot${nearExpiry.length > 1 ? 's' : ''} expired or expiring by tomorrow`} detail={[...new Set(nearExpiry.map((l) => productById[l.productId]?.name))].join(', ')} />);
  if (see('store') && negative.length) attention.push(<Attention key="n" href="/reports/coldroom" icon="alert" tone="red" title={`${negative.length} product${negative.length > 1 ? 's' : ''} with negative stock`} detail={negative.map(([id]) => productById[id]?.name).join(', ')} />);
  if (see('store') && !countsToday) attention.push(<Attention key="cnt" href="/store/count" icon="check" tone="blue" title="Today's cold room count not entered yet" detail="Count the cold room at the end of the day" />);
  if (backup && !backup.healthy) attention.push(<Attention key="bk" href="/backups" icon="alert" tone="red" title={!backup.lastOk ? 'No database backup recorded yet' : backup.last.status === 'FAILED' ? 'Last night’s backup failed' : 'Database backup is overdue'} detail="Open Backups to see the details" />);
  if (lowItems.length) attention.push(<Attention key="low" href="/general-store?low=1" icon="box" tone="amber" title={`${lowItems.length} general store item${lowItems.length > 1 ? 's' : ''} at or below reorder level`} detail={lowItems.slice(0, 6).map((i) => i.name).join(', ') + (lowItems.length > 6 ? ` +${lowItems.length - 6} more` : '')} />);

  const quick = [
    canEdit(role, 'receiving') && <Quick key="q" href="/receiving/new" icon="flask" label="New milk QC entry" />,
    canEdit(role, 'production') && <Quick key="p" href="/production" icon="factory" label="Open production batch" />,
    canEdit(role, 'dispatch') && <Quick key="d" href="/dispatch" icon="truck" label="New dispatch challan" />,
    canEdit(role, 'store') && <Quick key="r" href="/store/entries" icon="swap" label="Return / damage" />,
    canEdit(role, 'store') && <Quick key="c" href="/store/count" icon="check" label="Daily count" />,
    canEdit(role, 'generalStore') && <Quick key="g" href="/general-store" icon="box" label="Issue / receive store item" />,
    see('reports') && <Quick key="rep" href="/reports/coldroom" icon="chart" label="Cold room report" />,
  ].filter(Boolean);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-blue-600">{fmtDate(today)}</p>
          <h1 className="h1 mt-0.5">Good day, {user.name.split(' ')[0]}</h1>
        </div>
      </div>
      <Flash sp={sp} />

      {quick.length > 0 && <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">{quick}</div>}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        {see('receiving') && <Stat icon="drop" tone="blue" label="Milk accepted today" value={num(milkL)} unit="L" href="/receiving" sub={`${accepted.length} tanker${accepted.length === 1 ? '' : 's'} · ${rejected.length} rejected${pendingQc.length ? ` · ${pendingQc.length} waiting` : ''}`} />}
        {see('receiving') && <Stat icon="flask" tone="violet" label="Average fat / SNF" value={fat === null ? '–' : `${fat.toFixed(2)} / ${snf.toFixed(2)}`} unit={fat === null ? '' : '%'} sub="weighted by litres accepted today" />}
        {see('production') && <Stat icon="factory" tone="green" label="Packed today" value={num(packedL)} unit="L" href="/production" sub={allocL ? <>from {num(allocL)} L milk · {lossPct === null ? 'batches still open' : <>loss <span className={flag(lossPct, tols.PRODUCTION_LOSS) === 'red' ? 'font-semibold text-red-600' : ''}>{lossPct.toFixed(1)}%</span></>}</> : 'no batches today'} />}
        {see('store') && <Stat icon="truck" tone="amber" label="Dispatched today" value={num(dispatched[6])} unit="L" href="/dispatch" sub={`returns ${num(returned[6])} L · used/damage ${num(damaged[6])} L`} />}
        {tankL !== null && <Stat icon="tank" tone="blue" label="Milk in tank" value={num(tankL)} unit="L" href="/silos" sub="accepted − issued to production ± adjustments" />}
      </div>

      <div className="grid gap-5 xl:grid-cols-5">
        <Panel className="xl:col-span-3" title="Last 7 days" subtitle="Milk accepted at QC vs. products dispatched to market, in litres (kg products counted as litres)">
          <div className="px-4 pb-3 pt-4 sm:px-5">
            <BarChart labels={days.map((x) => bs(x).slice(5))} series={[{ name: 'Milk accepted', values: milkWeek }, { name: 'Dispatched', values: dispatched }]} />
          </div>
        </Panel>
        <Panel className="xl:col-span-2" title="Needs attention" subtitle={attention.length ? `${attention.length} item${attention.length > 1 ? 's' : ''}` : 'All clear'}>
          {attention.length ? <ul className="divide-y divide-slate-100">{attention}</ul> : <Empty>Nothing pending. Everything is up to date.</Empty>}
        </Panel>
      </div>

      {see('receiving') && (
        <Panel className="mt-5" title="Today's tankers" action={<PanelLink href="/receiving">All receiving</PanelLink>}>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>No.</th><th>Time</th><th>Vehicle</th><th>Supplier</th><th className="num">Litres</th><th className="num">Fat %</th><th className="num">SNF %</th><th>Status</th></tr></thead>
              <tbody>
                {receipts.slice(0, 8).map((r) => (
                  <tr key={r.id}>
                    <td><Link className="font-medium text-blue-600 hover:underline" href={`/receiving/${r.id}`}>{r.receiptNo}</Link></td>
                    <td className="text-slate-500">{fmtTime(r.arrivedAt)}</td>
                    <td>{r.vehicleNo}</td>
                    <td>{r.supplier.name}</td>
                    <td className="num">{num(r.supplierQtyL)}</td>
                    <td className="num">{r.fatPct ?? '–'}</td>
                    <td className="num">{r.snfPct ?? '–'}</td>
                    <td><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!receipts.length && <Empty>No tankers yet today.</Empty>}
          </div>
        </Panel>
      )}
    </div>
  );
}
