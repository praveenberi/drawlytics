import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { badRequest, conflict, h, notFound, parse, toDbDate } from '../http.js';
import { audit } from '../services/audit.js';
import { asRules, getLottery, serializeDraw } from '../services/data.js';
import { evaluatePendingForLottery, reevaluateAfterDrawChange } from '../services/evaluation.js';
import { canonical, canonicalBonus, validateNumbers } from '../services/rules.js';

export const adminDrawsRouter = Router();

const nums = z.array(z.number().int()).max(30);
const drawSchema = z.object({
  lotteryId: z.string().uuid(),
  drawDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  drawReference: z.string().trim().max(64).nullish().transform((v) => v || null),
  mainNumbers: nums,
  bonusNumbers: nums.default([]),
  remarks: z.string().trim().max(2000).nullish().transform((v) => v || null),
  status: z.enum(['PENDING', 'PUBLISHED']).default('PUBLISHED'),
});

async function prepare(body: unknown) {
  const v = parse(drawSchema, body);
  const d = new Date(v.drawDate + 'T00:00:00Z');
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v.drawDate) throw badRequest('Draw date is not a real calendar date.');
  if (d.getTime() > Date.now() + 86400000 && v.status === 'PUBLISHED') throw badRequest('A result cannot be published for a future date. Save it as pending instead.');
  const lottery = await getLottery(v.lotteryId);
  const rules = asRules(lottery.rulesJson);
  const errors = validateNumbers(rules, v.mainNumbers, v.bonusNumbers);
  if (errors.length) throw badRequest(errors[0], errors.map((m) => ({ field: 'numbers', message: m })));
  return { v, lottery, data: { drawDate: d, drawReference: v.drawReference, mainNumbers: canonical(rules, v.mainNumbers), bonusNumbers: canonicalBonus(v.bonusNumbers), remarks: v.remarks, status: v.status } };
}

async function assertNoDuplicate(lotteryId: string, date: Date, ref: string | null, ignoreId?: string) {
  const dup = await prisma.lotteryDraw.findFirst({
    where: { lotteryId, id: ignoreId ? { not: ignoreId } : undefined, OR: [{ drawDate: date }, ...(ref ? [{ drawReference: ref }] : [])] },
  });
  if (dup) throw conflict(dup.drawDate.getTime() === date.getTime() ? `A result for ${date.toISOString().slice(0, 10)} already exists for this lottery.` : `Draw reference "${ref}" is already used.`);
}

adminDrawsRouter.post('/', h(async (req, res) => {
  const { v, data } = await prepare(req.body);
  await assertNoDuplicate(v.lotteryId, data.drawDate, data.drawReference);
  const draw = await prisma.lotteryDraw.create({ data: { ...data, lotteryId: v.lotteryId, createdById: req.user!.id } });
  await audit(req, 'CREATE', 'LotteryDraw', draw.id, null, serializeDraw(draw));
  const evaluated = draw.status === 'PUBLISHED' ? await evaluatePendingForLottery(v.lotteryId) : 0;
  res.status(201).json({ draw: serializeDraw(draw), evaluatedPredictions: evaluated });
}));

adminDrawsRouter.put('/:id', h(async (req, res) => {
  const old = await prisma.lotteryDraw.findUnique({ where: { id: parse(z.string().uuid(), req.params.id) } });
  if (!old) throw notFound('Draw');
  const { v, data } = await prepare({ ...req.body, lotteryId: old.lotteryId });
  await assertNoDuplicate(old.lotteryId, data.drawDate, data.drawReference, old.id);
  const draw = await prisma.lotteryDraw.update({ where: { id: old.id }, data: { ...data, isSample: false } });
  await audit(req, 'UPDATE', 'LotteryDraw', draw.id, serializeDraw(old), serializeDraw(draw));
  const evaluated = await reevaluateAfterDrawChange(old.lotteryId, old.id);
  res.json({ draw: serializeDraw(draw), evaluatedPredictions: evaluated, lotteryId: v.lotteryId });
}));

adminDrawsRouter.post('/:id/publish', h(async (req, res) => {
  const old = await prisma.lotteryDraw.findUnique({ where: { id: parse(z.string().uuid(), req.params.id) } });
  if (!old) throw notFound('Draw');
  const draw = await prisma.lotteryDraw.update({ where: { id: old.id }, data: { status: 'PUBLISHED' } });
  await audit(req, 'PUBLISH', 'LotteryDraw', draw.id, serializeDraw(old), serializeDraw(draw));
  const evaluated = await evaluatePendingForLottery(old.lotteryId);
  res.json({ draw: serializeDraw(draw), evaluatedPredictions: evaluated });
}));

adminDrawsRouter.delete('/:id', h(async (req, res) => {
  const old = await prisma.lotteryDraw.findUnique({ where: { id: parse(z.string().uuid(), req.params.id) } });
  if (!old) throw notFound('Draw');
  // release predictions that were evaluated against this draw, then re-evaluate them against later draws
  await prisma.prediction.updateMany({ where: { evaluatedDrawId: old.id }, data: { evaluatedDrawId: null, evaluatedAt: null, matchedNumbers: null, matchedBonus: null, performanceStatus: 'PENDING' } });
  await prisma.lotteryDraw.delete({ where: { id: old.id } });
  await audit(req, 'DELETE', 'LotteryDraw', old.id, serializeDraw(old), null);
  await evaluatePendingForLottery(old.lotteryId);
  res.json({ ok: true });
}));
