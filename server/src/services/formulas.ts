import { prisma } from '../db.js';
import type { FormulaConfig } from './engine.js';

/** Apply the global on/off switch of prediction algorithms to a formula config. */
export async function applyGlobalAlgorithmFlags(config: FormulaConfig): Promise<FormulaConfig> {
  const off = await prisma.predictionAlgorithm.findMany({ where: { status: 'INACTIVE' }, select: { algorithmType: true } });
  if (!off.length) return config;
  const disabled = new Set(off.map((o) => o.algorithmType));
  return {
    ...config,
    primaryAlgorithm: disabled.has(config.primaryAlgorithm) ? 'WEIGHTED' : config.primaryAlgorithm,
    algorithms: config.algorithms.map((a) => (disabled.has(a.type) ? { ...a, enabled: false } : a)),
  };
}
