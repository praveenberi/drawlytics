# Lotto Insights – Track, Analyse & Explore

A personal lottery database and statistics tool. React + Vite + TypeScript, Tailwind CSS, shadcn-style UI components, Recharts, Lucide icons, Supabase (PostgreSQL + Auth + Row Level Security).

> **Lottery draws are random.** Everything here is descriptive statistics of past results. Hot/cold numbers, gaps and generated combinations are statistical experiments — none has any predictive advantage. The app never invents results: every draw is entered by you or imported from your own file, and is tagged *Manual*, *CSV import* or *External*.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
```

### Two storage modes

| Mode | When | Data lives in |
|------|------|---------------|
| **Local** | `.env.local` is empty / missing | this browser (localStorage) — no account needed |
| **Supabase** | `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` set | your Supabase project, private per user via RLS, with email/password sign-in |

Both implement the same `Store` interface (`src/lib/store`), so the UI is identical.

### Supabase setup

1. Create a project at supabase.com.
2. SQL Editor → paste and run [`supabase/schema.sql`](supabase/schema.sql). It creates `users`, `lottery_games`, `lottery_draws`, `draw_numbers`, `generated_combinations`, `favourite_combinations`, `user_settings`, a unique index preventing duplicate draw numbers per game, and an RLS policy on every table (`user_id = auth.uid()`).
3. Copy `.env.example` to `.env.local` and fill in the project URL and anon key (Project Settings → API).
4. `npm run dev`, then sign up. (If email confirmation is on, confirm the email first.)

## Features

- **Dashboard** – totals, latest draw, hot/cold numbers, upcoming draw dates, frequency chart, sum trend, recent additions, print.
- **Lottery Games** – any format: number range, main count, bonus count (own range or same pool), frequency, draw days/time, rules, personal notes. Templates for Toto, Powerball, EuroMillions, Mega Millions, UK Lotto (formats only — verify with the provider).
- **Winning History** – add/edit/delete, validation per game rules, duplicate prevention, search, date range & source filters, sorting, pagination, compare two draws, bulk delete.
- **Number Analysis** – frequency, hot & cold (last 10/20/50/100/all), gaps, odd/even, configurable range bands, pairs/triples/repeated combinations, consecutive-draw repeats and trends; print-friendly report.
- **Combination Generator** – Random, Hot, Cold, Balanced, Frequency-weighted, Gap-weighted; optional seed for reproducibility; save favourites.
- **My Favourites** – notes, labels, best historical match.
- **CSV Import / Export** – six exports (Excel/Sheets-friendly: UTF-8 BOM, CRLF, formula-injection safe) and a validating importer with duplicate checking and preview before saving.
- **Settings** – dark/light/system theme, page size, JSON backup & restore, delete-all.

### CSV import format

Required: `draw_date` and either `numbers` (space separated) or `n1,n2,…`. Optional: `draw_number`, `bonus_numbers` (or `b1,b2…`), `jackpot`, `winners`, `prize_details`, `notes`, `game`. Dates may be `YYYY-MM-DD`, `DD/MM/YYYY`, `MM/DD/YYYY` (choose in the UI) or `05 Jan 2024`. The history export can be re-imported as-is.

## How the numbers are computed

See `src/lib/analysis.ts` and `src/lib/generator.ts` (pure functions, documented):

- *Frequency %* = draws containing the number ÷ draws analysed.
- *Hot / cold* = k highest / lowest counts in the chosen window (ties → lower number).
- *Gap* = draws between appearances; *current gap* = draws since last seen.
- *Generator weights*: hot `(count−min+1)²`, cold `(max−count+1)²`, frequency `count+1`, gap `currentGap+1`, balanced = hot/cold/mid thirds with odd-even and low-high within ±1. *Frequency score* = average share of analysed draws in which each selected number appeared.

## Project layout

```
src/lib/analysis.ts      analysis engine
src/lib/generator.ts     combination strategies
src/lib/importer.ts      CSV import validation
src/lib/exports.ts       CSV exports
src/lib/store/           local + Supabase persistence
src/context/AppContext   app state, auth, theme
src/pages/               the eight screens
supabase/schema.sql      tables + RLS
```
