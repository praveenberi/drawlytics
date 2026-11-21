/**
 * Docker-free local PostgreSQL for development: `npm run db:embedded`.
 * Starts a real PostgreSQL 16 server (downloaded by the `embedded-postgres` package) on port 5432
 * with user/password/database "drawlytics", storing data in server/.pgdata. Leave it running.
 */
import fs from 'node:fs';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

const dir = path.resolve(process.cwd(), '.pgdata');
const port = Number(process.env.EMBEDDED_PG_PORT ?? 5432);
const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'drawlytics', password: 'drawlytics', port, persistent: true });

const fresh = !fs.existsSync(path.join(dir, 'PG_VERSION'));
if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase('drawlytics');
console.log(`PostgreSQL ready on localhost:${port}  (db/user/password: drawlytics). Press Ctrl+C to stop.`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => undefined, 1 << 30);
