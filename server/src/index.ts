import { config } from './config.js';
import { prisma } from './db.js';
import { createApp } from './app.js';

const app = createApp();
const server = app.listen(config.PORT, () => console.log(`Drawlytics API listening on http://localhost:${config.PORT} (${config.NODE_ENV})`));

const shutdown = async () => {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
