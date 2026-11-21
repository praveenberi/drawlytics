import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { h, isoDate, parse, toDbDate } from '../http.js';
import { predictLimiter, requireAuth } from '../middleware.js';
import { defaultFormulaConfig, formulaConfigSchema, generateCombos, secureRng } from '../services/engine.js';
import { asRules, getLottery, loadRecs } from '../services/data.js';
import { upcomingDrawDates } from '../services/schedule.js';
import { applyGlobalAlgorithmFlags } from '../services/formulas.js';

export const predictionsRouter = Router();
predictionsRouter.use(requireAuth);

export const DISCLAIMER =
  'Disclaimer: The suggested numbers are generated using mathematical formulas, historical lottery results, and statistical analysis. Lottery draws are random, and past results do not influence or guarantee future outcomes. These suggestions may not be accurate and should be considered for entertainment and informational purposes only. There is no guarantee of winning.';

const refId = () => `LN-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${randomBytes(4).toString('hex').toUpperCase()}`;

const serialize = (p: Prisma.PredictionGetPayload<{ include: { lottery: { include: { country: true } }; formula: true; evaluatedDraw: true } }>) => ({
  id: p.id,
  referenceId: p.referenceId,
  lottery: { id: p.lotteryId, name: p.lottery.lotteryName, country: p.lottery.country.countryName },
  formula: p.formula ? { id: p.formula.id, name: p.formula.formulaName, version: p.formula.version } : { id: null, name: 'Default weighted formula', version: 0 },
  suggestedNumbers: p.suggestedNumbers as number[],
  bonusNumbers: p.bonusNumbers as number[],
  analysisPeriod: p.analysisPeriod,
  targetDrawDate: p.targetDrawDate ? isoDate(p.targetDrawDate) : null,
  generatedAt: p.generatedAt,
  performanceStatus: p.performanceStatus,
  evaluatedAt: p.evaluatedAt,
  matchedNumbers: p.matchedNumbers,
  matchedBonus: p.matchedBonus,
  actual: p.evaluatedDraw ? { drawDate: isoDate(p.evaluatedDraw.drawDate), mainNumbers: p.evaluatedDraw.mainNumbers as number[], bonusNumbers: p.evaluatedDraw.bonusNumbers as number[] } : null,
});
const inc = { lottery: { include: { country: true } }, formula: true, evaluatedDraw: true } as const;

predictionsRouter.post(
  '/generate',
  predictLimiter,
  h(async (req, res) => {
    const body = parse(z.object({ lotteryId: z.string().uuid(), count: z.number().int().min(1).max(10).optional() }), req.body);
    const lottery = await getLottery(body.lotteryId, { activeOnly: true });
    const rules = asRules(lottery.rulesJson);
    const formula = await prisma.predictionFormula.findFirst({ where: { lotteryId: lottery.id, isActive: true } });
    const config = await applyGlobalAlgorithmFlags(formulaConfigSchema.parse(formula?.formulaConfig ?? defaultFormulaConfig()));
    const count = Math.min(body.count ?? config.combinations, 10);
    const history = await loadRecs(lottery.id);
    const combos = generateCombos(rules, config, history, count, secureRng());
    const target = upcomingDrawDates(lottery, 1)[0] ?? null;
    const period = config.periods.analysisDraws ? `Last ${config.periods.analysisDraws} draws` : `All stored draws (${history.length})`;
    const created = await prisma.$transaction(
      combos.map((c) =>
        prisma.prediction.create({
          data: { referenceId: refId(), lotteryId: lottery.id, formulaId: formula?.id ?? null, userId: req.user!.id, suggestedNumbers: c.main, bonusNumbers: c.bonus, analysisPeriod: period, targetDrawDate: target ? toDbDate(target) : null },
          include: inc,
        }),
      ),
    );
    res.status(201).json({ disclaimer: DISCLAIMER, historyDraws: history.length, items: created.map(serialize) });
  }),
);

predictionsRouter.get(
  '/',
  h(async (req, res) => {
    const q = parse(z.object({ lotteryId: z.string().uuid().optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }), req.query);
    const where: Prisma.PredictionWhereInput = { userId: req.user!.id, ...(q.lotteryId ? { lotteryId: q.lotteryId } : {}) };
    const [total, rows, agg] = await Promise.all([
      prisma.prediction.count({ where }),
      prisma.prediction.findMany({ where, orderBy: { generatedAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: inc }),
      prisma.prediction.aggregate({ where: { ...where, performanceStatus: 'EVALUATED' }, _count: { _all: true }, _avg: { matchedNumbers: true, matchedBonus: true }, _max: { matchedNumbers: true } }),
    ]);
    res.json({ total, page: q.page, pageSize: q.pageSize, items: rows.map(serialize), summary: { evaluated: agg._count._all, avgMatchedNumbers: agg._avg.matchedNumbers, avgMatchedBonus: agg._avg.matchedBonus, bestMatch: agg._max.matchedNumbers }, disclaimer: DISCLAIMER });
  }),
);
