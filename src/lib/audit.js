import { prisma } from './db';

export async function audit({ userId, action, entity, entityId, before, after, reason }, tx = prisma) {
  await tx.auditLog.create({
    data: {
      userId: userId ?? null,
      action,
      entity,
      entityId: entityId !== undefined && entityId !== null ? String(entityId) : null,
      before: before ?? undefined,
      after: after ?? undefined,
      reason: reason ?? null,
    },
  });
}
