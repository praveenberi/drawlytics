import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';

const clean = (v: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull =>
  v === undefined || v === null ? Prisma.JsonNull : (JSON.parse(JSON.stringify(v, (k, val) => (k === 'passwordHash' ? undefined : val))) as Prisma.InputJsonValue);

/** Append an audit trail entry. Never throws – auditing must not break the main operation. */
export async function audit(req: Request | null, action: string, entityType: string, entityId: string | null, oldValue?: unknown, newValue?: unknown, userId?: string) {
  try {
    await prisma.auditLog.create({
      data: { userId: userId ?? req?.user?.id ?? null, action, entityType, entityId, oldValue: clean(oldValue), newValue: clean(newValue) },
    });
  } catch (e) {
    console.error('audit failed', e);
  }
}
