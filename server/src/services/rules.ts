import { z } from 'zod';

/** Lottery number rules – stored as JSONB in lotteries.rules_json. Nothing about a specific game is hardcoded. */
export const bonusRulesSchema = z.object({
  count: z.number().int().min(1).max(10),
  minNumber: z.number().int().min(0),
  maxNumber: z.number().int().min(0),
  allowDuplicates: z.boolean().default(false),
  /** true: bonus numbers come from their own range (Powerball, EuroMillions stars); false: same pool as main numbers */
  separatePool: z.boolean().default(true),
});

export const rulesSchema = z
  .object({
    format: z.string().max(60).optional(),
    mainCount: z.number().int().min(1).max(20),
    minNumber: z.number().int().min(0).max(9999),
    maxNumber: z.number().int().min(1).max(9999),
    allowDuplicates: z.boolean().default(false),
    /** true for digit games (Pick 3/4) where position matters; numbers are stored in drawn order */
    ordered: z.boolean().default(false),
    /** zero-pad width used for display, e.g. 2 → "05" */
    padDigits: z.number().int().min(0).max(4).default(0),
    bonus: bonusRulesSchema.nullable().default(null),
  })
  .superRefine((r, ctx) => {
    if (r.minNumber >= r.maxNumber) ctx.addIssue({ code: 'custom', path: ['maxNumber'], message: 'Maximum must be greater than minimum' });
    const size = r.maxNumber - r.minNumber + 1;
    if (!r.allowDuplicates && r.mainCount > size) ctx.addIssue({ code: 'custom', path: ['mainCount'], message: 'More numbers drawn than available in the range' });
    if (r.bonus) {
      if (r.bonus.separatePool) {
        if (r.bonus.minNumber >= r.bonus.maxNumber) ctx.addIssue({ code: 'custom', path: ['bonus', 'maxNumber'], message: 'Bonus maximum must be greater than minimum' });
        else if (!r.bonus.allowDuplicates && r.bonus.count > r.bonus.maxNumber - r.bonus.minNumber + 1) ctx.addIssue({ code: 'custom', path: ['bonus', 'count'], message: 'More bonus numbers than available in the bonus range' });
      } else if (!r.allowDuplicates && r.mainCount + r.bonus.count > size) {
        ctx.addIssue({ code: 'custom', path: ['bonus', 'count'], message: 'Main + bonus numbers exceed the shared number pool' });
      }
    }
  });

export type Rules = z.infer<typeof rulesSchema>;

export const asRules = (json: unknown): Rules => rulesSchema.parse(json);

export const bonusRange = (r: Rules) => (r.bonus ? (r.bonus.separatePool ? { min: r.bonus.minNumber, max: r.bonus.maxNumber } : { min: r.minNumber, max: r.maxNumber }) : null);

/** Validate a draw's numbers against the lottery's rules. Returns human-readable errors. */
export function validateNumbers(rules: Rules, main: number[], bonus: number[]): string[] {
  const errors: string[] = [];
  const intOk = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);
  if (!main.every(intOk)) errors.push('Winning numbers must be whole numbers.');
  if (main.length !== rules.mainCount) errors.push(`Expected ${rules.mainCount} main numbers, got ${main.length}.`);
  const bad = main.filter((n) => intOk(n) && (n < rules.minNumber || n > rules.maxNumber));
  if (bad.length) errors.push(`Main numbers must be between ${rules.minNumber} and ${rules.maxNumber} (invalid: ${bad.join(', ')}).`);
  if (!rules.allowDuplicates && new Set(main).size !== main.length) errors.push('Duplicate main numbers are not allowed for this lottery.');

  if (!rules.bonus) {
    if (bonus.length) errors.push('This lottery has no bonus numbers.');
  } else {
    const b = rules.bonus;
    const rng = bonusRange(rules)!;
    if (!bonus.every(intOk)) errors.push('Bonus numbers must be whole numbers.');
    if (bonus.length !== b.count) errors.push(`Expected ${b.count} bonus number${b.count > 1 ? 's' : ''}, got ${bonus.length}.`);
    const bb = bonus.filter((n) => intOk(n) && (n < rng.min || n > rng.max));
    if (bb.length) errors.push(`Bonus numbers must be between ${rng.min} and ${rng.max} (invalid: ${bb.join(', ')}).`);
    if (!b.allowDuplicates && new Set(bonus).size !== bonus.length) errors.push('Duplicate bonus numbers are not allowed.');
    if (!b.separatePool && !rules.allowDuplicates && bonus.some((n) => main.includes(n))) errors.push('A bonus number repeats a main number (same pool).');
  }
  return errors;
}

/** Canonical storage form: unordered games are stored sorted, ordered (digit) games keep drawn order. */
export const canonical = (rules: Rules, main: number[]) => (rules.ordered ? [...main] : [...main].sort((a, b) => a - b));
export const canonicalBonus = (bonus: number[]) => [...bonus].sort((a, b) => a - b);

export const RULE_PRESETS: Record<string, Rules> = {
  '6/49': { format: '6/49', mainCount: 6, minNumber: 1, maxNumber: 49, allowDuplicates: false, ordered: false, padDigits: 2, bonus: null },
  '6/49+1': { format: '6/49 + 1 bonus', mainCount: 6, minNumber: 1, maxNumber: 49, allowDuplicates: false, ordered: false, padDigits: 2, bonus: { count: 1, minNumber: 1, maxNumber: 49, allowDuplicates: false, separatePool: false } },
  '5/50+2': { format: '5/50 + 2', mainCount: 5, minNumber: 1, maxNumber: 50, allowDuplicates: false, ordered: false, padDigits: 2, bonus: { count: 2, minNumber: 1, maxNumber: 12, allowDuplicates: false, separatePool: true } },
  pick3: { format: 'Pick 3', mainCount: 3, minNumber: 0, maxNumber: 9, allowDuplicates: true, ordered: true, padDigits: 0, bonus: null },
  pick4: { format: 'Pick 4', mainCount: 4, minNumber: 0, maxNumber: 9, allowDuplicates: true, ordered: true, padDigits: 0, bonus: null },
};
