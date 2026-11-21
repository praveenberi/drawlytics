/**
 * Database backup: `npm run db:backup` → backups/drawlytics-YYYYMMDD-HHMMSS.sql (plain SQL via pg_dump).
 * Requires the PostgreSQL client tools (pg_dump) on PATH. Schedule it with cron / Task Scheduler.
 * Restore with: psql "$DATABASE_URL" < backups/<file>.sql
 */
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}
const dir = path.resolve(process.cwd(), process.env.BACKUP_DIR ?? 'backups');
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const file = path.join(dir, `drawlytics-${stamp}.sql`);

// pg_dump does not understand Prisma's "?schema=" parameter, so strip query params.
const clean = url.split('?')[0];
const r = spawnSync('pg_dump', ['--no-owner', '--no-privileges', '--file', file, clean], { stdio: 'inherit' });
if (r.error || r.status !== 0) {
  console.error('pg_dump failed. Is the PostgreSQL client installed and on PATH?', r.error?.message ?? '');
  process.exit(1);
}
// keep the 14 most recent backups
const old = fs.readdirSync(dir).filter((f) => f.startsWith('drawlytics-') && f.endsWith('.sql')).sort().reverse().slice(14);
old.forEach((f) => fs.unlinkSync(path.join(dir, f)));
console.log(`Backup written: ${file}`);
