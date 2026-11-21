# Drawlytics – Global Lottery Tracker

A full-stack platform for managing lotteries from around the world, publishing and importing historical results, analysing number patterns, and generating **statistical number suggestions** (for entertainment only).

> **Lottery draws are random.** Statistics describe the past; they do not influence or predict future draws. The app says so wherever suggestions appear, and ships a back-test that compares every formula with a plain random baseline.

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, Recharts |
| Backend | Node.js, Express, REST, JWT (httpOnly cookie), role-based access control |
| Database | PostgreSQL 16, Prisma ORM, SQL migrations, indexes, constraints |
| Files | CSV and Excel (.xlsx) import/export, validated uploads |

## Quick start (local development)

Requirements: Node.js 18.17+ (20 recommended) and a PostgreSQL 14+ database. No local Postgres? Use Docker (`docker compose up db`) **or** the bundled Docker-free option below.

```bash
npm run install:all                 # install server + client dependencies

# 1. Database – pick ONE:
npm run db:embedded                 # a. Docker-free PostgreSQL on :5432 (leave this terminal running)
#   docker compose up -d db         # b. or Docker (then set DATABASE_URL accordingly)
#   …or any PostgreSQL you already have – edit DATABASE_URL in server/.env

# 2. Configure the server
cp server/.env.example server/.env  # then edit JWT_SECRET etc.

# 3. Create tables and load sample data (new terminal)
npm run db:migrate
npm run db:seed

# 4. Run (two terminals)
npm run dev:server                  # API  → http://localhost:4000
npm run dev:client                  # Web  → http://localhost:5173
```

Sign in at <http://localhost:5173/login> with the seeded admin (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, default `admin@drawlytics.local` / `ChangeMe!2026`). **Change the password before any real deployment.**

### Sample data

`npm run db:seed` (idempotent) creates 8 countries, 12 lotteries in different formats (6/49, 5/50+2, 5/69+1, 7/35+1, 4-digit, Pick 3/4, …), a default “Balanced Weighted” formula per lottery and the 10 prediction algorithms.

With `SEED_SAMPLE_DRAWS=true` it also creates ~130 draws per lottery. **These are pseudo-random demo numbers, not real results**: they are stored with `is_sample = true`, carry the remark “SAMPLE DATA”, and show a **SAMPLE** badge in the UI. Set `SEED_SAMPLE_DRAWS=false` for a clean database and load real results via bulk upload.

### Tests

With the API running and seeded: `npm run test:api` runs ~55 end-to-end checks (auth, RBAC, CRUD, validation, duplicate prevention, bulk import policies, file validation, analysis, suggestions, automatic evaluation, audit trail).

## Features

**Public** – browse countries and lotteries (search by country / name / provider / category / draw date; filter by country, category, frequency, status), latest results, historical results (date range, search by date or draw ID, sorting, pagination, CSV export), number analysis (frequency, hot/cold, gaps, odd-even, high-low, consecutive numbers, sums, repeats, pairs & triples, heatmap, selectable periods), number suggestions with saved history and automatic evaluation.

**Admin** (role `ADMIN`, enforced server-side) – lottery CRUD with fully configurable number rules, countries & categories, winning-number CRUD with rule validation and duplicate prevention, bulk CSV/XLSX upload (template download, column mapping, preview, skip/update/reject duplicates, error report, history), prediction formula manager (weights, periods, constraints, odd/even & high/low preferences, bonus rules, versions, activate/deactivate, back-test), algorithm switches, performance comparison, user management, audit logs.

### Lottery rules are data, not code

Each lottery stores `rules_json`:

```json
{ "mainCount": 5, "minNumber": 1, "maxNumber": 50, "allowDuplicates": false, "ordered": false, "padDigits": 2,
  "bonus": { "count": 2, "minNumber": 1, "maxNumber": 12, "allowDuplicates": false, "separatePool": true } }
```

Digit games (Pick 3/4, 4D) use `minNumber: 0, maxNumber: 9, allowDuplicates: true, ordered: true`. Validation, import, analysis and the suggestion engine all read these rules.

### Suggestion engine & evaluation

`server/src/services/engine.ts` implements ten algorithms: frequency, hot/cold, recent frequency, long-term frequency, gap, odd/even balance, high/low balance, pair frequency, random, and a weighted combination (default weights 25/20/15/15/10/10/5, fully configurable per lottery). Combinations are built number by number from the blended score, with optional hard constraints. When a result is published (or imported/edited/deleted) pending predictions are matched against the first draw that took place **after** they were generated (using the lottery’s time zone), storing main and bonus matches separately. **Performance** pages compare each formula version with the expected-by-chance average.

## Security

bcrypt (cost 12) password hashing · JWT in an httpOnly, SameSite=Lax cookie (Bearer tokens also accepted) · role re-checked from the database on every request (suspension/demotion is immediate) · all admin routes behind `requireAdmin` · zod validation on every input · Prisma parameterised queries · helmet headers · rate limiting (global, auth, upload, suggestions) · upload filtering by extension, size, magic bytes and row count · CSV formula-injection guard on exports · full audit trail with before/after values · secrets only in server environment variables.

## Project layout

```
client/            React app (pages, components, API client)
server/
  prisma/          schema.prisma, migrations/, seed.ts
  src/routes/      auth, public, predictions, admin*
  src/services/    stats (analysis), engine (suggestions), importer, evaluation, schedule, rules
  scripts/         embedded-db.ts, backup.ts
  test/smoke.ts    end-to-end API checks
templates/         static CSV import templates (the app also generates per-lottery templates)
docs/              API.md, DEPLOYMENT.md
legacy-v1/         earlier Supabase-based prototype (no longer used)
```

See [docs/API.md](docs/API.md) for the REST API and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for production, Docker, **Vercel + Cloudflare** (variables in [`.env.vercel.example`](.env.vercel.example)) and backups.
