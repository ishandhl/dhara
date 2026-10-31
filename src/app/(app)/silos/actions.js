'use server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireEdit } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { run, UserError, reqNum, reqStr, optStr, str, lock } from '@/lib/forms';
import { toDateOnly, todayISO } from '@/lib/dates';
import { tankRow, tankStock, tankDay } from '@/lib/milkTank';
import { round } from '@/lib/format';

const signed = (v) => `${v > 0 ? '+' : ''}${Math.round(v)} L`;

/** Measured litres in the tank, compared with what the system expects. */
export async function recordTankReading(formData) {
  await run('/silos', async () => {
    const user = await requireEdit('silos');
    const kind = str(formData, 'kind') || 'CLOSING';
    if (!['OPENING', 'CLOSING', 'CHECK'].includes(kind)) throw new UserError('Invalid reading type');
    const litres = reqNum(formData, 'litres', 'Measured litres');
    if (litres < 0) throw new UserError('Litres cannot be below 0');
    const today = todayISO();
    const tank = await tankRow();
    // A morning reading is taken before the day's tankers and batches, so compare it with the day's opening.
    const sys = kind === 'OPENING' ? (await tankDay(today)).opening : await tankStock(today);
    const row = await prisma.siloDip.create({
      data: { siloId: tank.id, date: toDateOnly(today), kind, dipCm: 0, litres: round(litres, 1), systemLitres: sys, varianceL: round(litres - sys, 1), note: optStr(formData, 'note'), createdById: user.id },
    });
    await audit({ userId: user.id, action: 'CREATE', entity: 'TankReading', entityId: row.id, after: row });
    revalidatePath('/silos');
    return `/silos?ok=${encodeURIComponent(`Measured ${Math.round(litres)} L, system ${Math.round(sys)} L (difference ${signed(row.varianceL)})`)}`;
  });
}

/** Manager correction, e.g. opening stock on day one or booking a measured difference. */
export async function adjustTank(formData) {
  await run('/silos', async () => {
    const user = await requireEdit('approve');
    const litres = reqNum(formData, 'litres', 'Adjustment litres');
    const reason = reqStr(formData, 'reason', 'Reason');
    if (litres === 0) throw new UserError('Adjustment cannot be 0');
    const today = todayISO();
    let dup = false;
    await prisma.$transaction(async (tx) => {
      await lock(tx, 'tank');
      const tank = await tankRow(tx);
      // The same adjustment again within 10 minutes is a double tap or a re-sent form, not a second correction.
      dup = !!(await tx.siloMovement.findFirst({ where: { siloId: tank.id, type: 'ADJUSTMENT', litres, note: reason, createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } } }));
      if (dup) return;
      const s = await tankStock(today, tx);
      if (s + litres < -0.5) throw new UserError(`The tank has ${Math.round(s)} L; it cannot go below zero`);
      const m = await tx.siloMovement.create({ data: { siloId: tank.id, date: toDateOnly(today), type: 'ADJUSTMENT', litres, note: reason, createdById: user.id } });
      await audit({ userId: user.id, action: 'CREATE', entity: 'TankAdjustment', entityId: m.id, after: { litres }, reason }, tx);
    });
    if (dup) return `/silos?ok=${encodeURIComponent(`Adjustment ${signed(litres)} was already saved a moment ago — not added twice`)}`;
    revalidatePath('/silos');
    return `/silos?ok=${encodeURIComponent(`Adjustment ${signed(litres)} saved`)}`;
  });
}
