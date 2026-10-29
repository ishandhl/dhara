'use server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireEdit } from '@/lib/auth';
import { MASTERS, parseMasterForm } from '@/lib/masters';
import { audit } from '@/lib/audit';
import { run, UserError, reqNum, optNum } from '@/lib/forms';
import { dipToLitres } from '@/lib/dip';

export async function saveMaster(kind, formData) {
  const back = `/masters/${kind}`;
  await run(back, async () => {
    const user = await requireEdit('masters');
    const cfg = MASTERS[kind];
    if (!cfg) throw new UserError('Unknown master');
    let data;
    try { data = parseMasterForm(cfg, formData); } catch (e) { throw new UserError(e.message); }
    const id = parseInt(formData.get('id'), 10);
    const model = prisma[cfg.model];
    if (id) {
      const before = await model.findUnique({ where: { id } });
      const after = await model.update({ where: { id }, data });
      await audit({ userId: user.id, action: 'UPDATE', entity: cfg.model, entityId: id, before, after });
    } else {
      const after = await model.create({ data });
      await audit({ userId: user.id, action: 'CREATE', entity: cfg.model, entityId: after.id, after });
    }
    revalidatePath(back);
    const label = data[cfg.primary || cfg.columns[0]];
    return `${back}?ok=${encodeURIComponent(label ? `Saved ${label}` : 'Saved')}`;
  });
}

// ── Product packaging (bill of materials) ──
export async function saveProductPackaging(productId, formData) {
  const back = `/masters/products/${productId}`;
  await run(back, async () => {
    const user = await requireEdit('masters');
    const packagingItemId = reqNum(formData, 'packagingItemId', 'Packaging item');
    const qtyPerUnit = reqNum(formData, 'qtyPerUnit', 'Quantity per unit');
    if (qtyPerUnit <= 0) throw new UserError('Quantity must be above 0');
    const row = await prisma.productPackaging.upsert({
      where: { productId_packagingItemId: { productId, packagingItemId } },
      create: { productId, packagingItemId, qtyPerUnit },
      update: { qtyPerUnit },
    });
    await audit({ userId: user.id, action: 'UPDATE', entity: 'ProductPackaging', entityId: row.id, after: row });
  });
}

export async function removeProductPackaging(productId, id) {
  const back = `/masters/products/${productId}`;
  await run(back, async () => {
    const user = await requireEdit('masters');
    const before = await prisma.productPackaging.delete({ where: { id } });
    await audit({ userId: user.id, action: 'DELETE', entity: 'ProductPackaging', entityId: id, before });
  });
}

// ── Dip chart ──
export async function saveDipChart(siloId, formData) {
  const back = `/masters/silos/${siloId}`;
  await run(back, async () => {
    const user = await requireEdit('masters');
    const text = String(formData.get('chart') || '');
    const points = [];
    for (const [i, line] of text.split(/\r?\n/).entries()) {
      const t = line.trim();
      if (!t) continue;
      const parts = t.split(/[\s,;\t]+/).filter(Boolean);
      if (parts.length < 2) throw new UserError(`Line ${i + 1}: needs "cm litres"`);
      const cm = Number(parts[0]);
      const litres = Number(parts[1]);
      if (Number.isNaN(cm) || Number.isNaN(litres)) throw new UserError(`Line ${i + 1}: not numbers`);
      points.push({ cm, litres });
    }
    points.sort((a, b) => a.cm - b.cm);
    for (let i = 1; i < points.length; i++) {
      if (points[i].cm === points[i - 1].cm) throw new UserError(`Duplicate cm value ${points[i].cm}`);
      if (points[i].litres < points[i - 1].litres) throw new UserError(`Litres must increase with cm (check ${points[i].cm} cm)`);
    }
    if (points.length === 1) throw new UserError('Enter at least 2 points');
    const before = await prisma.dipPoint.findMany({ where: { siloId }, orderBy: { cm: 'asc' } });
    await prisma.$transaction([
      prisma.dipPoint.deleteMany({ where: { siloId } }),
      prisma.dipPoint.createMany({ data: points.map((p) => ({ ...p, siloId })) }),
    ]);
    await audit({ userId: user.id, action: 'UPDATE', entity: 'DipChart', entityId: siloId, before: before.map(({ cm, litres }) => ({ cm, litres })), after: points });
    return `${back}?ok=${encodeURIComponent(`Dip chart saved (${points.length} points)`)}`;
  });
}

export async function testDip(siloId, formData) {
  const back = `/masters/silos/${siloId}`;
  const cm = optNum(formData, 'cm');
  const points = await prisma.dipPoint.findMany({ where: { siloId } });
  const silo = await prisma.silo.findUnique({ where: { id: siloId } });
  const l = dipToLitres(points, cm);
  const { redirect } = await import('next/navigation');
  redirect(`${back}?testcm=${cm}&testl=${l === null ? '' : l.toFixed(1)}&testf=${l === null ? '' : (l * silo.correctionFactor).toFixed(1)}`);
}
