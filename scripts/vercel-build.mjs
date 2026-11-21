// Build step for Vercel: generate the Prisma client, build the API and the web client, and (production only,
// opt-in) apply database migrations. Run by vercel.json → buildCommand.
import { spawnSync } from 'node:child_process';

function run(cmd, args, env = {}) {
  console.log(`\n> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, env: { ...process.env, ...env } });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run('npm', ['--prefix', 'server', 'run', 'prisma:generate']);
run('npm', ['--prefix', 'server', 'run', 'build']);
run('npm', ['--prefix', 'client', 'run', 'build']);

// Migrations run only for production deployments, and only when MIGRATE_DATABASE_URL is set (use the database's
// DIRECT, non-pooled connection string). Preview deployments never touch the database schema.
const isProd = process.env.VERCEL_ENV === 'production';
const migrateUrl = process.env.MIGRATE_DATABASE_URL;
if (isProd && migrateUrl) {
  run('npm', ['--prefix', 'server', 'run', 'migrate:deploy'], { DATABASE_URL: migrateUrl });
} else {
  console.log('\nSkipping database migrations (needs VERCEL_ENV=production and MIGRATE_DATABASE_URL).');
}
