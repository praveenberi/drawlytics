export interface BonusRules {
  count: number;
  minNumber: number;
  maxNumber: number;
  allowDuplicates: boolean;
  separatePool: boolean;
}
export interface Rules {
  format?: string;
  mainCount: number;
  minNumber: number;
  maxNumber: number;
  allowDuplicates: boolean;
  ordered: boolean;
  padDigits: number;
  bonus: BonusRules | null;
}
export interface Country {
  id: string;
  name: string;
  code: string;
  currency: string | null;
  timezone: string;
  lotteryCount: number;
}
export interface Category {
  id: string;
  name: string;
  description: string | null;
  lotteryCount: number;
}
export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM';
export interface Draw {
  id: string;
  lotteryId: string;
  drawDate: string;
  drawReference: string | null;
  mainNumbers: number[];
  bonusNumbers: number[];
  status: 'PENDING' | 'PUBLISHED';
  remarks: string | null;
  isSample: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface Lottery {
  id: string;
  name: string;
  countryId: string;
  country: { id: string; name: string; code: string; currency: string | null };
  categoryId: string | null;
  category: { id: string; name: string } | null;
  stateRegion: string | null;
  provider: string;
  currency: string | null;
  description: string | null;
  websiteUrl: string | null;
  drawFrequency: Frequency;
  drawDays: number[];
  drawTime: string | null;
  timezone: string;
  rules: Rules;
  status: 'ACTIVE' | 'INACTIVE';
  latestDraw?: Draw | null;
  nextDrawDates?: string[];
  drawCount?: number;
  activeFormula?: { id: string; name: string; version: number } | null;
}
export interface Paged<T> {
  total: number;
  page: number;
  pageSize: number;
  items: T[];
}
export interface Prediction {
  id: string;
  referenceId: string;
  lottery: { id: string; name: string; country: string };
  formula: { id: string | null; name: string; version: number };
  suggestedNumbers: number[];
  bonusNumbers: number[];
  analysisPeriod: string;
  targetDrawDate: string | null;
  generatedAt: string;
  performanceStatus: 'PENDING' | 'EVALUATED';
  evaluatedAt: string | null;
  matchedNumbers: number | null;
  matchedBonus: number | null;
  actual: { drawDate: string; mainNumbers: number[]; bonusNumbers: number[] } | null;
}

export interface FormulaConfig {
  primaryAlgorithm: string;
  algorithms: { type: string; enabled: boolean; weight: number }[];
  periods: { analysisDraws: number | null; recentDraws: number; frequencyDraws: number | null; hotColdDraws: number };
  hotColdMode: 'hot' | 'cold';
  constraints: { minNumber: number | null; maxNumber: number | null; exclude: number[]; include: number[] };
  oddEven: { minOdd: number | null; maxOdd: number | null; enforce: boolean };
  highLow: { minHigh: number | null; maxHigh: number | null; enforce: boolean };
  bonus: { strategy: 'RANDOM' | 'FREQUENCY' | 'HOT' | 'COLD' | 'GAP'; exclude: number[] };
  combinations: number;
  sharpness: number;
}
export interface Formula {
  id: string;
  lotteryId: string;
  formulaName: string;
  version: number;
  isActive: boolean;
  formulaConfig: FormulaConfig;
  createdAt: string;
  createdBy: string | null;
  predictionCount: number;
}

export const DISCLAIMER =
  'Disclaimer: The suggested numbers are generated using mathematical formulas, historical lottery results, and statistical analysis. Lottery draws are random, and past results do not influence or guarantee future outcomes. These suggestions may not be accurate and should be considered for entertainment and informational purposes only. There is no guarantee of winning.';
export const SHORT_NOTE = 'These are statistical suggestions only, not guaranteed winning numbers.';
