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
