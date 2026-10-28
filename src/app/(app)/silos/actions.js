'use server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireEdit } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { run, UserError, reqNum, optNum, reqStr, optStr, str } from '@/lib/forms';
import { toDateOnly, todayISO } from '@/lib/dates';
import { dipToLitres } from '@/lib/dip';
import { siloStock } from '@/lib/stock';
import { round } from '@/lib/format';

export async function recordDip(formData) {
  await run('/silos', async () => {
    const user = await requireEdit('silos');
    const siloId = reqNum(formData, 'siloId', 'Silo');
    const kind = str(formData, 'kind') || 'CLOSING';
    if (!['OPENING', 'CLOSING', 'CHECK'].includes(kind)) throw new UserError('Invalid reading type');
    const silo = await prisma.silo.findUnique({ where: { id: siloId }, include: { dipPoints: true } });
    const dipCm = optNum(formData, 'dipCm');
    let litres = optNum(formData, 'litres');
    if (dipCm !== null) {
      const l = dipToLitres(silo.dipPoints, dipCm);
      if (l === null) throw new UserError(`${silo.name} has no dip chart; enter litres instead`);
      litres = l * silo.correctionFactor;
    }
    if (litres === null) throw new UserError('Enter the dip (cm) or the litres');
    const sys = await siloStock(siloId);
    const row = await prisma.siloDip.create({
      data: { siloId, date: toDateOnly(todayISO()), kind, dipCm: dipCm ?? 0, litres: round(litres, 1), systemLitres: round(sys.litres, 1), varianceL: round(litres - sys.litres, 1), note: optStr(formData, 'note'), createdById: user.id },
    });
    await audit({ userId: user.id, action: 'CREATE', entity: 'SiloDip', entityId: row.id, after: row });
    revalidatePath('/silos');
    return `/silos?ok=${encodeURIComponent(`${silo.name}: dip ${Math.round(litres)} L vs system ${Math.round(sys.litres)} L (${row.varianceL > 0 ? '+' : ''}${Math.round(row.varianceL)} L)`)}`;
  });
}

export async function transferMilk(formData) {
  await run('/silos', async () => {
    const user = await requireEdit('silos');
    const fromId = reqNum(formData, 'fromId', 'From silo');
    const toId = reqNum(formData, 'toId', 'To silo');
    const litres = reqNum(formData, 'litres', 'Litres');
    if (fromId === toId) throw new UserError('Pick two different silos');
    if (litres <= 0) throw new UserError('Litres must be above 0');
    const date = toDateOnly(todayISO());
    await prisma.$transaction(async (tx) => {
      const from = await siloStock(fromId, tx);
      if (from.litres < litres) throw new UserError(`Only ${Math.round(from.litres)} L in the source silo`);
      const to = await tx.silo.findUnique({ where: { id: toId } });
      const toStock = await siloStock(toId, tx);
      if (toStock.litres + litres > to.capacityL * 1.02) throw new UserError(`${to.name} does not have room for ${litres} L`);
      const share = litres / from.litres;
      const kgFat = round(from.kgFat * share, 2);
      const kgSnf = round(from.kgSnf * share, 2);
      const note = optStr(formData, 'note');
      const out = await tx.siloMovement.create({ data: { siloId: fromId, date, type: 'TRANSFER_OUT', litres: -litres, kgFat: -kgFat, kgSnf: -kgSnf, note, createdById: user.id } });
      await tx.siloMovement.create({ data: { siloId: toId, date, type: 'TRANSFER_IN', litres, kgFat, kgSnf, refType: 'SiloMovement', refId: out.id, note, createdById: user.id } });
      await audit({ userId: user.id, action: 'CREATE', entity: 'SiloTransfer', entityId: out.id, after: { fromId, toId, litres } }, tx);
    });
    revalidatePath('/silos');
    return '/silos?ok=Transfer saved';
  });
}

export async function adjustSilo(formData) {
  await run('/silos', async () => {
    const user = await requireEdit('approve');
    const siloId = reqNum(formData, 'siloId', 'Silo');
    const litres = reqNum(formData, 'litres', 'Adjustment litres');
    const reason = reqStr(formData, 'reason', 'Reason');
    if (litres === 0) throw new UserError('Adjustment cannot be 0');
    await prisma.$transaction(async (tx) => {
      const s = await siloStock(siloId, tx);
      if (s.litres + litres < -0.5) throw new UserError('Stock would go below zero');
      const share = s.litres > 0 ? litres / s.litres : 0;
      const m = await tx.siloMovement.create({ data: { siloId, date: toDateOnly(todayISO()), type: 'ADJUSTMENT', litres, kgFat: round(s.kgFat * share, 2), kgSnf: round(s.kgSnf * share, 2), note: reason, createdById: user.id } });
      await audit({ userId: user.id, action: 'CREATE', entity: 'SiloAdjustment', entityId: m.id, after: { siloId, litres }, reason }, tx);
    });
    revalidatePath('/silos');
    return '/silos?ok=Adjustment saved';
  });
}
