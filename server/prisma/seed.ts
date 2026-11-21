/**
 * Seed script (idempotent).
 *  - prediction algorithms, categories, countries, lotteries (formats only), default formulas
 *  - an admin account from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
 *  - OPTIONAL demo draws (SEED_SAMPLE_DRAWS=true): pseudo-random numbers, flagged is_sample = true and
 *    labelled "SAMPLE DATA" everywhere. They are NOT real lottery results.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { Prisma, PrismaClient } from '@prisma/client';
import { ALGORITHM_CATALOG, defaultFormulaConfig, mulberry32 } from '../src/services/engine.js';
import { upcomingDrawDates } from '../src/services/schedule.js';
import type { Rules } from '../src/services/rules.js';

const prisma = new PrismaClient();

const R = (r: Partial<Rules> & Pick<Rules, 'mainCount' | 'minNumber' | 'maxNumber'>): Rules => ({ allowDuplicates: false, ordered: false, padDigits: 2, bonus: null, ...r });
const sharedBonus = { count: 1, minNumber: 1, maxNumber: 49, allowDuplicates: false, separatePool: false };

const COUNTRIES = [
  ['Singapore', 'SG', 'SGD', 'Asia/Singapore'], ['United States', 'US', 'USD', 'America/New_York'], ['United Kingdom', 'GB', 'GBP', 'Europe/London'],
  ['France', 'FR', 'EUR', 'Europe/Paris'], ['Canada', 'CA', 'CAD', 'America/Toronto'], ['Germany', 'DE', 'EUR', 'Europe/Berlin'],
  ['Australia', 'AU', 'AUD', 'Australia/Sydney'], ['Japan', 'JP', 'JPY', 'Asia/Tokyo'],
] as const;

const CATEGORIES = [
  ['Jackpot Lotto', 'Pick several numbers from a pool; large rolling jackpots.'],
  ['Daily Numbers', 'Digit-based games (Pick 3, Pick 4, 4D) with frequent draws.'],
  ['Multi-country / Multi-state', 'Games operated by a consortium across regions or countries.'],
];

type Seed = { code: string; name: string; cat: number; provider: string; region?: string; freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM'; days: number[]; time: string; tz?: string; url?: string; desc: string; rules: Rules };
const LOTTERIES: Seed[] = [
  { code: 'SG', name: 'Singapore Toto', cat: 0, provider: 'Singapore Pools', freq: 'WEEKLY', days: [1, 4], time: '18:30', url: 'https://www.singaporepools.com.sg', desc: '6 numbers from 1–49 plus one additional number from the same pool.', rules: R({ format: '6/49 + 1 additional', mainCount: 6, minNumber: 1, maxNumber: 49, bonus: sharedBonus }) },
  { code: 'SG', name: 'Singapore 4D', cat: 1, provider: 'Singapore Pools', freq: 'WEEKLY', days: [0, 3, 6], time: '18:30', desc: 'Modelled here as the 4-digit first-prize number only (digits 0–9, order matters, repeats allowed).', rules: R({ format: '4-digit', mainCount: 4, minNumber: 0, maxNumber: 9, allowDuplicates: true, ordered: true, padDigits: 0 }) },
  { code: 'US', name: 'Powerball', cat: 2, provider: 'Multi-State Lottery Association', freq: 'WEEKLY', days: [1, 3, 6], time: '22:59', tz: 'America/New_York', url: 'https://www.powerball.com', desc: '5 numbers from 1–69 plus 1 Powerball from 1–26 (current format).', rules: R({ format: '5/69 + 1/26', mainCount: 5, minNumber: 1, maxNumber: 69, bonus: { count: 1, minNumber: 1, maxNumber: 26, allowDuplicates: false, separatePool: true } }) },
  { code: 'US', name: 'Mega Millions', cat: 2, provider: 'Mega Millions consortium', freq: 'WEEKLY', days: [2, 5], time: '23:00', tz: 'America/New_York', url: 'https://www.megamillions.com', desc: '5 numbers from 1–70 plus 1 Mega Ball from 1–24 (format changed in April 2025).', rules: R({ format: '5/70 + 1/24', mainCount: 5, minNumber: 1, maxNumber: 70, bonus: { count: 1, minNumber: 1, maxNumber: 24, allowDuplicates: false, separatePool: true } }) },
  { code: 'US', name: 'Pick 3 (Daily)', cat: 1, provider: 'State lottery (example: New York)', region: 'New York', freq: 'DAILY', days: [], time: '22:30', tz: 'America/New_York', desc: 'Three digits 0–9; order matters and repeats are allowed.', rules: R({ format: 'Pick 3', mainCount: 3, minNumber: 0, maxNumber: 9, allowDuplicates: true, ordered: true, padDigits: 0 }) },
  { code: 'US', name: 'Pick 4 (Daily)', cat: 1, provider: 'State lottery (example: New York)', region: 'New York', freq: 'DAILY', days: [], time: '22:30', tz: 'America/New_York', desc: 'Four digits 0–9; order matters and repeats are allowed.', rules: R({ format: 'Pick 4', mainCount: 4, minNumber: 0, maxNumber: 9, allowDuplicates: true, ordered: true, padDigits: 0 }) },
  { code: 'GB', name: 'National Lottery Lotto', cat: 0, provider: 'Allwyn', freq: 'WEEKLY', days: [3, 6], time: '20:00', url: 'https://www.national-lottery.co.uk', desc: '6 numbers from 1–59 plus a bonus ball from the same pool.', rules: R({ format: '6/59 + bonus ball', mainCount: 6, minNumber: 1, maxNumber: 59, bonus: { count: 1, minNumber: 1, maxNumber: 59, allowDuplicates: false, separatePool: false } }) },
  { code: 'FR', name: 'EuroMillions', cat: 2, provider: 'FDJ (Française des Jeux)', freq: 'WEEKLY', days: [2, 5], time: '20:15', desc: 'Pan-European game: 5 numbers from 1–50 plus 2 Lucky Stars from 1–12 (current format).', rules: R({ format: '5/50 + 2/12', mainCount: 5, minNumber: 1, maxNumber: 50, bonus: { count: 2, minNumber: 1, maxNumber: 12, allowDuplicates: false, separatePool: true } }) },
  { code: 'CA', name: 'Lotto 6/49', cat: 0, provider: 'Canadian provincial lotteries (OLG / Loto-Québec / others)', freq: 'WEEKLY', days: [3, 6], time: '21:30', desc: '6 numbers from 1–49 plus a bonus number from the same pool.', rules: R({ format: '6/49 + bonus', mainCount: 6, minNumber: 1, maxNumber: 49, bonus: sharedBonus }) },
  { code: 'DE', name: 'Lotto 6aus49', cat: 0, provider: 'Deutscher Lotto- und Totoblock', freq: 'WEEKLY', days: [3, 6], time: '18:25', desc: '6 numbers from 1–49 plus a Superzahl (0–9).', rules: R({ format: '6/49 + Superzahl', mainCount: 6, minNumber: 1, maxNumber: 49, bonus: { count: 1, minNumber: 0, maxNumber: 9, allowDuplicates: false, separatePool: true } }) },
  { code: 'AU', name: 'Powerball Australia', cat: 0, provider: 'The Lott', freq: 'WEEKLY', days: [4], time: '20:30', desc: '7 numbers from 1–35 plus 1 Powerball from 1–20.', rules: R({ format: '7/35 + 1/20', mainCount: 7, minNumber: 1, maxNumber: 35, bonus: { count: 1, minNumber: 1, maxNumber: 20, allowDuplicates: false, separatePool: true } }) },
  { code: 'JP', name: 'Loto 6', cat: 0, provider: 'Mizuho Bank / Japan lottery', freq: 'WEEKLY', days: [1, 4], time: '18:45', desc: '6 numbers from 1–43 plus a bonus number from the same pool.', rules: R({ format: '6/43 + bonus', mainCount: 6, minNumber: 1, maxNumber: 43, bonus: { count: 1, minNumber: 1, maxNumber: 43, allowDuplicates: false, separatePool: false } }) },
];

function sampleDraws(rules: Rules, dates: string[], seed: number) {
  const rng = mulberry32(seed);
  const pickN = (min: number, max: number, count: number, dup: boolean, exclude: number[] = []) => {
    const out: number[] = [];
    while (out.length < count) {
      const n = min + Math.floor(rng() * (max - min + 1));
      if (!dup && (out.includes(n) || exclude.includes(n))) continue;
      out.push(n);
    }
    return out;
  };
  return dates.map((date, i) => {
    const m = pickN(rules.minNumber, rules.maxNumber, rules.mainCount, rules.allowDuplicates);
    const main = rules.ordered ? m : [...m].sort((a, b) => a - b);
    const bonus = rules.bonus ? (rules.bonus.separatePool ? pickN(rules.bonus.minNumber, rules.bonus.maxNumber, rules.bonus.count, rules.bonus.allowDuplicates) : pickN(rules.minNumber, rules.maxNumber, rules.bonus.count, false, m)).sort((a, b) => a - b) : [];
    return { date, ref: `SAMPLE-${String(i + 1).padStart(4, '0')}`, main, bonus };
  });
}

/** Past draw dates (oldest first) following a lottery's weekly / daily schedule. */
function pastDates(days: number[], freq: string, count: number): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  while (out.length < count) {
    if (freq === 'DAILY' || days.includes(d.getUTCDay())) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out.reverse();
}

async function main() {
  for (const a of ALGORITHM_CATALOG) {
    await prisma.predictionAlgorithm.upsert({ where: { algorithmType: a.type }, update: {}, create: { algorithmType: a.type, algorithmName: a.name, description: a.description } });
  }
  const cats = [];
  for (const [name, description] of CATEGORIES) cats.push(await prisma.lotteryCategory.upsert({ where: { name }, update: {}, create: { name, description } }));
  const countries = new Map<string, string>();
  for (const [countryName, countryCode, currency, timezone] of COUNTRIES) {
    const c = await prisma.country.upsert({ where: { countryCode }, update: {}, create: { countryName, countryCode, currency, timezone } });
    countries.set(countryCode, c.id);
  }

  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@drawlytics.local').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!2026';
  let admin = await prisma.user.findUnique({ where: { email } });
  if (!admin) admin = await prisma.user.create({ data: { name: 'Administrator', email, role: 'ADMIN', passwordHash: await bcrypt.hash(password, 12) } });

  const withSamples = (process.env.SEED_SAMPLE_DRAWS ?? 'true') === 'true';
  let seedNo = 1;
  for (const s of LOTTERIES) {
    const countryId = countries.get(s.code)!;
    const country = COUNTRIES.find((c) => c[1] === s.code)!;
    const tz = s.tz ?? country[3];
    let lottery = await prisma.lottery.findFirst({ where: { countryId, lotteryName: s.name } });
    if (!lottery) {
      lottery = await prisma.lottery.create({
        data: { countryId, categoryId: cats[s.cat].id, lotteryName: s.name, stateRegion: s.region ?? null, provider: s.provider, currency: country[2], description: `${s.desc} Number format is configured data – always confirm the official rules with the provider.`, websiteUrl: s.url ?? null, drawFrequency: s.freq, drawDays: s.days, drawTime: s.time, timezone: tz, rulesJson: s.rules as unknown as Prisma.InputJsonValue },
      });
    }
    if (!(await prisma.predictionFormula.count({ where: { lotteryId: lottery.id } }))) {
      await prisma.predictionFormula.create({ data: { lotteryId: lottery.id, formulaName: 'Balanced Weighted', version: 1, isActive: true, createdById: admin.id, formulaConfig: defaultFormulaConfig() as unknown as Prisma.InputJsonValue } });
    }
    if (withSamples && !(await prisma.lotteryDraw.count({ where: { lotteryId: lottery.id } }))) {
      const n = s.freq === 'DAILY' ? 180 : 130;
      const rows = sampleDraws(s.rules, pastDates(s.days, s.freq, n), 1000 + seedNo++);
      await prisma.lotteryDraw.createMany({
        data: rows.map((r) => ({ lotteryId: lottery!.id, drawDate: new Date(r.date + 'T00:00:00Z'), drawReference: r.ref, mainNumbers: r.main, bonusNumbers: r.bonus, remarks: 'SAMPLE DATA – pseudo-random numbers for demonstration, not a real draw result.', isSample: true, createdById: admin!.id })),
      });
    }
  }
  console.log(`Seed complete. Admin login: ${email} (password from SEED_ADMIN_PASSWORD).`);
  console.log(withSamples ? 'Sample draws were generated and are flagged as SAMPLE DATA.' : 'No sample draws were created.');
  void upcomingDrawDates;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
