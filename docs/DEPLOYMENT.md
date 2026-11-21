# Deployment

## 1. Docker Compose (single host)

```bash
cp .env.example .env            # set JWT_SECRET, POSTGRES_PASSWORD, SEED_ADMIN_PASSWORD
docker compose up -d --build    # PostgreSQL + app (API and built web client on one origin, port 4000)
docker compose run --rm app npx tsx prisma/seed.ts   # first run only: reference data, admin, sample data
```

The container runs `prisma migrate deploy` on every start, so schema updates ship with the image. Browse to `http://<host>:4000`.
Put a TLS-terminating reverse proxy (Caddy, nginx, Traefik, a cloud load balancer) in front, then set `FORCE_HTTPS=true` so cookies are `Secure` and HSTS is sent. Behind a proxy the app already trusts one hop (`trust proxy`), which keeps rate limiting accurate.

For a clean production database use `SEED_SAMPLE_DRAWS=false` (demo draws are flagged `is_sample` and can be removed with `DELETE FROM lottery_draws WHERE is_sample;`).

## 1b. Vercel + Cloudflare (serverless)

The repo is ready for a single Vercel project: `vercel.json` serves the built client from `client/dist` and routes `/api/*` to `api/index.mjs`, which wraps the Express app as a serverless function (same origin, so no CORS or cross-site cookies). Cloudflare provides DNS, CDN, TLS and WAF in front.

**Steps**

1. **Database** – create a hosted PostgreSQL (Neon, Supabase, Vercel Postgres, …). Note both the **pooled** URL (for the app) and the **direct** URL (for migrations).
2. **Vercel** – import the GitHub repo as a project (Framework preset: *Other*; the settings come from `vercel.json`). Add the variables from [`.env.vercel.example`](../.env.vercel.example) under *Settings → Environment Variables*.
3. **Create the schema and admin once, from your own machine** (the direct URL, never committed):
   ```bash
   npm run install:all
   DATABASE_URL="<direct url>" npm run db:migrate
   DATABASE_URL="<direct url>" SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_PASSWORD='<strong password>' SEED_SAMPLE_DRAWS=false npm run db:seed
   ```
   (PowerShell: set `$env:DATABASE_URL=…` first.) Or set `MIGRATE_DATABASE_URL` in Vercel so each production deploy runs `prisma migrate deploy` automatically.
4. **Deploy**, then open `https://<project>.vercel.app/api/health`.
5. **Cloudflare** – add the domain to Cloudflare, then in *Vercel → Settings → Domains* add `drawlytics.com` and `www`. In Cloudflare *DNS* create the records Vercel shows (typically `A @ 76.76.21.21` and `CNAME www cname.vercel-dns.com`).
   - Start with **DNS only** (grey cloud) until Vercel shows the domain as valid and has issued its certificate, then switch to **Proxied** (orange cloud) if you want the CDN/WAF.
   - *SSL/TLS → Overview*: **Full (strict)**. Turn on *Always Use HTTPS* and *Automatic HTTPS Rewrites*.
   - *Caching → Cache Rules*: **Bypass cache** for URI path starting with `/api/`. (The API also sends `Cache-Control: no-store`.) Static files under `/assets/` are fingerprinted and safe to cache.
   - *Security → WAF → Rate limiting rules*: limit `/api/auth/` (e.g. 10 requests / minute / IP). **Do this**: the app's built-in limiter keeps its counters in each serverless instance's memory, so it cannot enforce global limits on Vercel.
   - Set `TRUST_CLOUDFLARE=true` in Vercel only once the domain is proxied. The app then reads the visitor IP from `CF-Connecting-IP` for audit logs and rate limiting. Anyone calling the `*.vercel.app` URL directly could forge that header, so use the custom domain for real traffic (optionally add a Vercel firewall rule/*Deployment Protection* to restrict the `.vercel.app` hostname).

**Limits to know about**

- Vercel rejects request bodies over **4.5 MB**, so keep `MAX_UPLOAD_MB` ≤ 4 (split larger imports into several files).
- Functions are capped at 30 s (`maxDuration` in `vercel.json`; raise it on paid plans). Back-tests over very long histories are the heaviest call.
- Use the pooled connection string and `connection_limit=1`; otherwise bursts of traffic exhaust PostgreSQL connections.
- No local file storage: uploads are processed in memory and the error report is kept in the database, so nothing needs a persistent disk.
- Backups: use your database provider's backups/point-in-time recovery (`db:backup` needs `pg_dump` on a machine that can reach the direct URL).

## 2. Without Docker

```bash
npm run install:all
export DATABASE_URL=… JWT_SECRET=… NODE_ENV=production FORCE_HTTPS=true   # or server/.env
npm run build                   # client → client/dist, server → server/dist
npm --prefix server run migrate:deploy
npm --prefix server run db:seed # first run only
npm start                       # serves API + web app on $PORT (default 4000)
```

Run it under a process manager (systemd, pm2) and a reverse proxy.

## 3. Split hosting (static front end + API)

Serve `client/dist` from a CDN/static host and the API elsewhere. The client calls relative `/api` URLs, so route `/api/*` of the front-end domain to the API (proxy rule), or keep both under one domain. If the API lives on another origin, set `CLIENT_ORIGIN` (CORS allow-list) and adjust the cookie `sameSite`/domain in `server/src/routes/auth.ts`.

## Environment variables (server)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | ≥ 32 random characters (the server refuses to start otherwise) |
| `JWT_EXPIRES_IN` | token lifetime, default `7d` |
| `CLIENT_ORIGIN` | CORS origin(s), comma-separated (dev: `http://localhost:5173`) |
| `FORCE_HTTPS` | `true` behind HTTPS: secure cookies, HSTS |
| `TRUST_CLOUDFLARE` | `true` only when all traffic goes through Cloudflare: use `CF-Connecting-IP` as the client IP |
| `MIGRATE_DATABASE_URL` | Vercel build only: direct DB URL; production builds then run `prisma migrate deploy` |
| `MAX_UPLOAD_MB`, `MAX_IMPORT_ROWS` | upload limits |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_SAMPLE_DRAWS` | used only by the seed script |

Secrets live only on the server; the front end never receives credentials or keys.

## Database migrations

Migrations are plain SQL under `server/prisma/migrations`. Development: edit `schema.prisma`, run `npm --prefix server run migrate:dev -- --name <change>`. Production: `migrate:deploy` (also run by the Docker image). The initial migration also adds a partial unique index (one active formula per lottery) and JSON/array check constraints that Prisma cannot express.

## Backups

```bash
npm --prefix server run db:backup     # needs pg_dump on PATH → server/backups/drawlytics-<timestamp>.sql (keeps the 14 newest)
```

Schedule it (cron / Task Scheduler / a sidecar container) and copy the files off-host. With Docker: `docker compose exec db pg_dump -U drawlytics drawlytics > backup.sql`. Restore: `psql "$DATABASE_URL" < backup.sql` into an empty database. Managed PostgreSQL providers also offer point-in-time recovery — enable it.

## Production checklist

- [ ] Strong `JWT_SECRET`, database password and admin password; remove or change the seeded admin credentials
- [ ] HTTPS in front, `FORCE_HTTPS=true`
- [ ] `SEED_SAMPLE_DRAWS=false` (or delete sample draws)
- [ ] Automated, tested backups
- [ ] Database not exposed publicly; only the app can reach it
- [ ] Monitor `/api/health`
