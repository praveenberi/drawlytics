import { prisma } from '../db.js';
import { isoDate } from '../http.js';
import { matchBonus, matchMain } from './engine.js';
import { asRules } from './rules.js';
import { drawInstant } from './schedule.js';

/**
 * Compare pending suggestions with the first published draw that took place after they were generated
 * (and on/after their target draw date, if set). Returns the number of predictions evaluated.
 */
export async function evaluatePendingForLottery(lotteryId: string): Promise<number> {
  const pending = await prisma.prediction.findMany({ where: { lotteryId, performanceStatus: 'PENDING' } });
  if (!pending.length) return 0;
  const lottery = await prisma.lottery.findUnique({ where: { id: lotteryId } });
  if (!lottery) return 0;
  const rules = asRules(lottery.rulesJson);
  const earliest = new Date(Math.min(...pending.map((p) => p.generatedAt.getTime())) - 2 * 86400000);
  const draws = await prisma.lotteryDraw.findMany({ where: { lotteryId, status: 'PUBLISHED', drawDate: { gte: earliest } }, orderBy: { drawDate: 'asc' } });
  if (!draws.length) return 0;

  let n = 0;
  for (const p of pending) {
    const target = p.targetDrawDate ? isoDate(p.targetDrawDate) : null;
    const draw = draws.find((d) => {
      const iso = isoDate(d.drawDate);
      return (!target || iso >= target) && drawInstant(iso, lottery.drawTime, lottery.timezone).getTime() > p.generatedAt.getTime();
    });
    if (!draw) continue;
    await prisma.prediction.update({
      where: { id: p.id },
      data: {
        matchedNumbers: matchMain(rules, p.suggestedNumbers as number[], draw.mainNumbers as number[]),
        matchedBonus: matchBonus(p.bonusNumbers as number[], draw.bonusNumbers as number[]),
        evaluatedAt: new Date(),
        evaluatedDrawId: draw.id,
        performanceStatus: 'EVALUATED',
      },
    });
    n++;
  }
  return n;
}

/** A draw was edited or removed: undo evaluations against it, then evaluate again. */
export async function reevaluateAfterDrawChange(lotteryId: string, drawId: string) {
  await prisma.prediction.updateMany({
    where: { evaluatedDrawId: drawId },
    data: { evaluatedDrawId: null, evaluatedAt: null, matchedNumbers: null, matchedBonus: null, performanceStatus: 'PENDING' },
  });
  return evaluatePendingForLottery(lotteryId);
}
