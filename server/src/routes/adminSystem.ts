import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { badRequest, conflict, h, notFound, parse } from '../http.js';
import { audit } from '../services/audit.js';
import { asRules } from '../services/data.js';
import { expectedChanceMatches } from '../services/engine.js';

export const adminSystemRouter = Router();
const id = z.string().uuid();
const pg = { page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) };
const safeUser = { id: true, name: true, email: true, role: true, status: true, createdAt: true } as const;

// ---------- users ----------
adminSystemRouter.get('/users', h(async (req, res) => {
  const q = parse(z.object({ q: z.string().trim().max(100).optional(), role: z.enum(['ADMIN', 'USER']).optional(), status: z.enum(['ACTIVE', 'SUSPENDED']).optional(), ...pg }), req.query);
  const where: Prisma.UserWhereInput = { role: q.role, status: q.status, ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }] } : {}) };
  const [total, rows] = await Promise.all([prisma.user.count({ where }), prisma.user.findMany({ where, select: { ...safeUser, _count: { select: { predictions: true } } }, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize })]);
  res.json({ total, page: q.page, pageSize: q.pageSize, items: rows.map((u) => ({ ...u, predictions: u._count.predictions, _count: undefined })) });
}));

adminSystemRouter.post('/users', h(async (req, res) => {
  const body = parse(z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().toLowerCase().email(), password: z.string().min(8).max(128).refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'Needs a letter and a number'), role: z.enum(['ADMIN', 'USER']).default('USER') }), req.body);
  if (await prisma.user.findUnique({ where: { email: body.email } })) throw conflict('Email already registered.');
  const u = await prisma.user.create({ data: { name: body.name, email: body.email, role: body.role, passwordHash: await bcrypt.hash(body.password, 12) }, select: safeUser });
  await audit(req, 'CREATE', 'User', u.id, null, u);
  res.status(201).json(u);
}));

adminSystemRouter.patch('/users/:id', h(async (req, res) => {
  const uid = parse(id, req.params.id);
  const body = parse(z.object({ name: z.string().trim().min(2).max(120).optional(), role: z.enum(['ADMIN', 'USER']).optional(), status: z.enum(['ACTIVE', 'SUSPENDED']).optional() }), req.body);
  const old = await prisma.user.findUnique({ where: { id: uid }, select: safeUser });
  if (!old) throw notFound('User');
  if (uid === req.user!.id && ((body.role && body.role !== old.role) || (body.status && body.status !== old.status))) throw badRequest('You cannot change your own role or status.');
  const u = await prisma.user.update({ where: { id: uid }, data: body, select: safeUser });
  await audit(req, 'UPDATE', 'User', uid, old, u);
  res.json(u);
}));

adminSystemRouter.delete('/users/:id', h(async (req, res) => {
  const uid = parse(id, req.params.id);
  if (uid === req.user!.id) throw badRequest('You cannot delete your own account.');
  const old = await prisma.user.findUnique({ where: { id: uid }, select: safeUser });
  if (!old) throw notFound('User');
  await prisma.user.delete({ where: { id: uid } });
  await audit(req, 'DELETE', 'User', uid, old, null);
  res.json({ ok: true });
}));

// ---------- audit logs ----------
adminSystemRouter.get('/audit-logs', h(async (req, res) => {
  const q = parse(z.object({ entityType: z.string().max(60).optional(), action: z.string().max(40).optional(), userId: id.optional(), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), entityId: z.string().max(64).optional(), ...pg }), req.query);
  const where: Prisma.AuditLogWhereInput = {
    entityType: q.entityType, action: q.action, userId: q.userId, entityId: q.entityId,
    ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(q.from + 'T00:00:00Z') } : {}), ...(q.to ? { lt: new Date(new Date(q.to + 'T00:00:00Z').getTime() + 86400000) } : {}) } } : {}),
  };
  const [total, rows, types] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { user: { select: { name: true, email: true } } } }),
    prisma.auditLog.findMany({ distinct: ['entityType'], select: { entityType: true } }),
  ]);
  res.json({ total, page: q.page, pageSize: q.pageSize, entityTypes: types.map((t) => t.entityType).sort(), items: rows.map((r) => ({ id: r.id, action: r.action, entityType: r.entityType, entityId: r.entityId, oldValue: r.oldValue, newValue: r.newValue, createdAt: r.createdAt, user: r.user ? { name: r.user.name, email: r.user.email } : null })) });
}));

// ---------- admin dashboard ----------
adminSystemRouter.get('/dashboard', h(async (_req, res) => {
  const since = new Date(Date.now() - 30 * 86400000);
  const [lotteries, activeLotteries, countries, published, pending, uploads, uploads30, failedUploads, users, predictions, evaluated, recentUploads, recentAudit, perf] = await Promise.all([
    prisma.lottery.count(),
    prisma.lottery.count({ where: { status: 'ACTIVE' } }),
    prisma.country.count(),
    prisma.lotteryDraw.count({ where: { status: 'PUBLISHED' } }),
    prisma.lotteryDraw.count({ where: { status: 'PENDING' } }),
    prisma.bulkUpload.aggregate({ _count: { _all: true }, _sum: { successfulRecords: true, failedRecords: true } }),
    prisma.bulkUpload.count({ where: { uploadedAt: { gte: since } } }),
    prisma.bulkUpload.count({ where: { uploadStatus: { in: ['FAILED', 'REJECTED'] } } }),
    prisma.user.count(),
    prisma.prediction.count(),
    prisma.prediction.count({ where: { performanceStatus: 'EVALUATED' } }),
    prisma.bulkUpload.findMany({ orderBy: { uploadedAt: 'desc' }, take: 5, include: { lottery: { select: { lotteryName: true } } } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8, include: { user: { select: { name: true } } } }),
    prisma.prediction.groupBy({ by: ['formulaId'], where: { performanceStatus: 'EVALUATED', formulaId: { not: null } }, _count: { _all: true }, _avg: { matchedNumbers: true, matchedBonus: true } }),
  ]);
  const formulas = perf.length ? await prisma.predictionFormula.findMany({ where: { id: { in: perf.map((p) => p.formulaId!) } }, include: { lottery: { select: { lotteryName: true, rulesJson: true } } } }) : [];
  const fBy = new Map(formulas.map((f) => [f.id, f]));
  res.json({
    totals: { lotteries, activeLotteries, countries, publishedDraws: published, pendingDraws: pending, users, predictions, evaluatedPredictions: evaluated },
    uploads: { total: uploads._count._all, last30Days: uploads30, failed: failedUploads, recordsImported: uploads._sum.successfulRecords ?? 0, recordsFailed: uploads._sum.failedRecords ?? 0 },
    recentUploads: recentUploads.map((u) => ({ id: u.id, fileName: u.fileName, lottery: u.lottery.lotteryName, status: u.uploadStatus, successful: u.successfulRecords, failed: u.failedRecords, uploadedAt: u.uploadedAt })),
    recentActivity: recentAudit.map((a) => ({ id: a.id, action: a.action, entityType: a.entityType, user: a.user?.name ?? null, createdAt: a.createdAt })),
    formulaPerformance: perf
      .map((p) => ({ formulaId: p.formulaId!, formula: `${fBy.get(p.formulaId!)?.formulaName ?? '?'} v${fBy.get(p.formulaId!)?.version ?? '?'}`, lottery: fBy.get(p.formulaId!)?.lottery.lotteryName ?? '', evaluated: p._count._all, avgMatchedNumbers: p._avg.matchedNumbers, avgMatchedBonus: p._avg.matchedBonus, expectedByChance: fBy.get(p.formulaId!) ? expectedChanceMatches(asRules(fBy.get(p.formulaId!)!.lottery.rulesJson)) : null }))
      .sort((a, b) => b.evaluated - a.evaluated)
      .slice(0, 8),
  });
}));
