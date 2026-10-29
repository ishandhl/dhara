'use server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireEdit } from '@/lib/auth';
import { MASTERS, parseMasterForm } from '@/lib/masters';
import { audit } from '@/lib/audit';
import { run, UserError, reqNum, optNum } from '@/lib/forms';

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
