import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config.js';
import { apiLimiter, authenticate, errorHandler, requireAdmin } from './middleware.js';
import { adminCatalogRouter } from './routes/adminCatalog.js';
import { adminDrawsRouter } from './routes/adminDraws.js';
import { adminFormulasRouter } from './routes/adminFormulas.js';
import { adminSystemRouter } from './routes/adminSystem.js';
import { adminUploadsRouter } from './routes/adminUploads.js';
import { authRouter } from './routes/auth.js';
import { predictionsRouter } from './routes/predictions.js';
import { publicRouter } from './routes/public.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.isProd ? 1 : false);
  app.use(
    helmet({
      contentSecurityPolicy: config.isProd ? { useDefaults: true, directives: { 'upgrade-insecure-requests': config.FORCE_HTTPS ? [] : null } } : false,
      hsts: config.FORCE_HTTPS,
    }),
  );
  if (config.TRUST_CLOUDFLARE) {
    // Behind Cloudflare the connecting peer is a Cloudflare/edge IP; use the visitor IP it reports so
    // rate limiting and audit logs see real clients. Only enable when direct access is not possible.
    const ipv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
    const ipv6 = /^[0-9a-f:]+$/i;
    app.use((req, _res, next) => {
      const cf = req.headers['cf-connecting-ip'];
      const ip = Array.isArray(cf) ? cf[0] : cf;
      if (ip && (ipv4.test(ip) || (ip.includes(':') && ipv6.test(ip)))) req.headers['x-forwarded-for'] = ip;
      next();
    });
  }
  app.use(cors({ origin: config.clientOrigins, credentials: true }));
  // API responses can be user-specific: tell Cloudflare / browsers never to cache them.
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  if (config.NODE_ENV !== 'test') app.use(morgan(config.isProd ? 'combined' : 'dev'));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

  app.use('/api', apiLimiter, authenticate);
  app.use('/api/auth', authRouter);
  app.use('/api/predictions', predictionsRouter);
  app.use('/api', publicRouter);

  // Everything below requires an administrator.
  const admin = express.Router();
  admin.use(requireAdmin);
  admin.use('/draws', adminDrawsRouter);
  admin.use('/uploads', adminUploadsRouter);
  admin.use('/', adminCatalogRouter);
  admin.use('/', adminFormulasRouter);
  admin.use('/', adminSystemRouter);
  app.use('/api/admin', admin);

  app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown API endpoint.' } }));

  // Serve the built client (single-origin deployment) when present.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = [path.resolve(here, '../../client/dist'), path.resolve(here, '../../../client/dist')].find((p) => fs.existsSync(path.join(p, 'index.html'))) ?? '';
  if (clientDist) {
    app.use(express.static(clientDist, { maxAge: '1h', index: false }));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
