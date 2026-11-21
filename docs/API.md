# REST API

Base URL: `/api`. JSON in/out. Authentication is an httpOnly cookie (`dl_token`) set by login/register; `Authorization: Bearer <jwt>` is also accepted. Errors:

```json
{ "error": { "code": "BAD_REQUEST", "message": "mainNumbers: ...", "details": [{ "field": "...", "message": "..." }] } }
```

Codes: `400 BAD_REQUEST`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 CONFLICT` (duplicates / referenced data), `429 RATE_LIMITED`, `500 INTERNAL`.

Access: **Public** = no login · **User** = any signed-in user · **Admin** = role `ADMIN`.

## Auth

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/auth/register` | Public | `{name,email,password}` (8+ chars, letter + number) → 201, sets cookie |
| POST | `/auth/login` | Public | `{email,password}` |
| POST | `/auth/logout` | Public | clears cookie |
| GET | `/auth/me` | Public | `{user}` or `{user:null}` |
| POST | `/auth/change-password` | User | `{currentPassword,newPassword}` |

## Public data

| Method | Path | Notes |
|---|---|---|
| GET | `/countries`, `/categories` | with active-lottery counts |
| GET | `/lotteries` | `q, countryId, categoryId, frequency, status(ACTIVE\|INACTIVE\|ALL – non-active only for admins), page, pageSize` |
| GET | `/lotteries/options` | compact list for pickers |
| GET | `/lotteries/:id` | detail + latest draw + next draw dates + active formula |
| GET | `/lotteries/:id/draws` | `from, to, q (YYYY-MM-DD, YYYY-MM or draw ID), sort(asc\|desc), page, pageSize` |
| GET | `/lotteries/:id/draws/export.csv` | same filters; Excel-friendly CSV |
| GET | `/results/latest` | latest draw per active lottery; `countryId, limit` |
| GET | `/search?q=` | lotteries by name/provider/country/category; draws if `q` is a date |
| GET | `/dashboard` | public dashboard payload |
| GET | `/analysis/:lotteryId` | `last=N` **or** `from,to`; optional `hotWindow`. Returns frequency, hot/cold, gaps, odd-even, high-low, consecutive, sums, repeats, pairs, triples, bonus, heatmap |
| GET | `/suggestion-info/:lotteryId` | active formula summary |

## Suggestions (User)

| Method | Path | Notes |
|---|---|---|
| POST | `/predictions/generate` | `{lotteryId, count?(1–10)}` → saved predictions with `referenceId`, formula, period, target draw date, plus the disclaimer text |
| GET | `/predictions` | my history; `lotteryId, page, pageSize`; includes evaluation (`matchedNumbers`, `matchedBonus`, `actual`) and a summary |

## Admin (`/api/admin/*`)

All routes return 401/403 for non-admins.

| Area | Endpoints |
|---|---|
| Countries | `POST /countries`, `PUT /countries/:id`, `DELETE /countries/:id` (409 if lotteries exist) |
| Categories | `POST /categories`, `PUT /categories/:id`, `DELETE /categories/:id` |
| Lotteries | `GET /rule-presets`, `POST /lotteries`, `PUT /lotteries/:id` (rule changes are rejected if they would invalidate stored draws), `DELETE /lotteries/:id` (cascades) |
| Draws | `POST /draws`, `PUT /draws/:id`, `POST /draws/:id/publish`, `DELETE /draws/:id`. Body: `{lotteryId, drawDate, drawReference?, mainNumbers[], bonusNumbers[], remarks?, status: PENDING\|PUBLISHED}`. Validated against `rules_json`; duplicates (same date or reference per lottery) → 409. Listing uses `GET /lotteries/:id/draws?status=ALL` |
| Bulk upload | `GET /uploads/template?lotteryId&format=csv\|xlsx` · `POST /uploads/inspect` (multipart `file`, `lotteryId`) → headers, sample rows, suggested mapping · `POST /uploads/preview` (+`mapping` JSON, `dateFormat` iso\|dmy\|mdy, `publish`) → per-row status valid/duplicate/invalid · `POST /uploads/commit` (+`duplicatePolicy` skip\|update\|reject) · `GET /uploads/history` · `GET /uploads/:id/errors.csv` |
| Algorithms | `GET /algorithms`, `PUT /algorithms/:id`, `GET /algorithm-types` (catalog + default formula config) |
| Formulas | `GET /formulas?lotteryId`, `POST /formulas` (creates v1 or the next version of that name), `PUT /formulas/:id` (only while unused by predictions), `POST /formulas/:id/activate {active}` (one active per lottery), `DELETE /formulas/:id`, `POST /formulas/test {lotteryId, formulaConfig, lastN}` (walk-forward back-test vs random baseline) |
| Performance | `GET /performance?lotteryId` |
| Users | `GET /users`, `POST /users`, `PATCH /users/:id {name?,role?,status?}`, `DELETE /users/:id` (cannot change/delete yourself) |
| Audit | `GET /audit-logs?entityType&action&userId&entityId&from&to&page` |
| Dashboard | `GET /dashboard` |

### Formula config (`prediction_formulas.formula_config`)

```json
{
  "primaryAlgorithm": "WEIGHTED",
  "algorithms": [{ "type": "LONG_TERM_FREQUENCY", "enabled": true, "weight": 25 }, "…"],
  "periods": { "analysisDraws": null, "recentDraws": 20, "frequencyDraws": 100, "hotColdDraws": 30 },
  "hotColdMode": "hot",
  "constraints": { "minNumber": null, "maxNumber": null, "exclude": [], "include": [] },
  "oddEven": { "minOdd": null, "maxOdd": null, "enforce": true },
  "highLow": { "minHigh": null, "maxHigh": null, "enforce": true },
  "bonus": { "strategy": "RANDOM", "exclude": [] },
  "combinations": 3,
  "sharpness": 1
}
```

Algorithm types: `FREQUENCY, LONG_TERM_FREQUENCY, RECENT_FREQUENCY, HOT_COLD, GAP, PAIR_FREQUENCY, ODD_EVEN, HIGH_LOW, RANDOM` (components) and `WEIGHTED` (blend). `null` odd/even or high/low limits mean “near balanced”.

### Import file format

Default headers (generated per lottery by `/uploads/template`): `draw_date, draw_id, number_1…number_N, bonus_number (or bonus_number_1…), remarks`. Columns can be mapped to any header, or a single column containing all numbers separated by space, comma, `;` or `|`. Dates: `YYYY-MM-DD`, `DD/MM/YYYY` or `MM/DD/YYYY` (choose in the UI), or `05 Jan 2026`. Limits: 5 MB, 20 000 rows, `.csv` / `.xlsx` only (first sheet).
