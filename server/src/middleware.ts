import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { Prisma, type Role } from '@prisma/client';
import { MulterError } from 'multer';
import { config } from './config.js';
import { prisma } from './db.js';
import { forbidden, h, HttpError, unauthorized } from './http.js';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}
declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export const COOKIE_NAME = 'dl_token';

export function signToken(userId: string, role: Role) {
  return jwt.sign({ sub: userId, role }, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN } as jwt.SignOptions);
}

function readToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return (req.cookies?.[COOKIE_NAME] as string | undefined) ?? null;
}

/** Attaches req.user when a valid token for an ACTIVE user is present; never rejects. */
export const authenticate = h(async (req, _res, next) => {
  const token = readToken(req);
  if (token) {
    try {
      const payload = jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload;
      const user = await prisma.user.findUnique({ where: { id: String(payload.sub) }, select: { id: true, name: true, email: true, role: true, status: true } });
      if (user && user.status === 'ACTIVE') req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    } catch {
      /* invalid / expired token → treated as anonymous */
    }
  }
  next();
});

export const requireAuth = (req: Request, _res: Response, next: NextFunction) => (req.user ? next() : next(unauthorized()));
export const requireAdmin = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== 'ADMIN') return next(forbidden('Administrator access required'));
  next();
};

const limiter = (windowMs: number, limit: number, message: string) =>
  rateLimit({ windowMs, limit, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message } } });

export const apiLimiter = limiter(15 * 60_000, 600, 'Too many requests, please slow down.');
export const authLimiter = limiter(15 * 60_000, 30, 'Too many authentication attempts. Try again later.');
export const uploadLimiter = limiter(60 * 60_000, 60, 'Upload limit reached. Try again later.');
export const predictLimiter = limiter(60 * 60_000, 120, 'Prediction limit reached. Try again later.');

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  if (err instanceof MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? `File is larger than ${config.MAX_UPLOAD_MB} MB.` : err.message;
    return res.status(400).json({ error: { code: 'UPLOAD_ERROR', message: msg } });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return res.status(409).json({ error: { code: 'CONFLICT', message: 'A record with these unique values already exists.', details: err.meta } });
    if (err.code === 'P2025') return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Record not found.' } });
    if (err.code === 'P2003') return res.status(409).json({ error: { code: 'CONFLICT', message: 'This record is still referenced by other data.' } });
  }
  if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Malformed JSON body.' } });
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: config.isProd ? 'Internal server error.' : String((err as Error)?.message ?? err) } });
}
