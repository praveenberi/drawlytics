import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { conflict, h, parse, unauthorized, badRequest } from '../http.js';
import { authLimiter, COOKIE_NAME, requireAuth, signToken } from '../middleware.js';
import { audit } from '../services/audit.js';

export const authRouter = Router();

const password = z.string().min(8, 'Password must be at least 8 characters').max(128).refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'Password needs at least one letter and one number');
const registerSchema = z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().toLowerCase().email().max(255), password });
const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(128) });

const cookieOpts = { httpOnly: true, sameSite: 'lax' as const, secure: config.FORCE_HTTPS, maxAge: 7 * 24 * 3600 * 1000, path: '/' };
const publicUser = (u: { id: string; name: string; email: string; role: string }) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

authRouter.post(
  '/register',
  authLimiter,
  h(async (req, res) => {
    const body = parse(registerSchema, req.body);
    if (await prisma.user.findUnique({ where: { email: body.email } })) throw conflict('An account with this email already exists.');
    const user = await prisma.user.create({ data: { name: body.name, email: body.email, passwordHash: await bcrypt.hash(body.password, 12), role: 'USER' } });
    await audit(req, 'REGISTER', 'User', user.id, null, { email: user.email }, user.id);
    res.cookie(COOKIE_NAME, signToken(user.id, user.role), cookieOpts);
    res.status(201).json({ user: publicUser(user) });
  }),
);

// Constant-ish time: always run a bcrypt compare to avoid revealing which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

authRouter.post(
  '/login',
  authLimiter,
  h(async (req, res) => {
    const body = parse(loginSchema, req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    const ok = await bcrypt.compare(body.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      await audit(req, 'LOGIN_FAILED', 'User', user?.id ?? null, null, { email: body.email }, user?.id);
      throw unauthorized('Invalid email or password.');
    }
    if (user.status !== 'ACTIVE') throw unauthorized('This account has been suspended.');
    await audit(req, 'LOGIN', 'User', user.id, null, null, user.id);
    res.cookie(COOKIE_NAME, signToken(user.id, user.role), cookieOpts);
    res.json({ user: publicUser(user) });
  }),
);

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, { ...cookieOpts, maxAge: undefined });
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => res.json({ user: req.user ? publicUser(req.user) : null }));

authRouter.post(
  '/change-password',
  requireAuth,
  authLimiter,
  h(async (req, res) => {
    const body = parse(z.object({ currentPassword: z.string().min(1), newPassword: password }), req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!(await bcrypt.compare(body.currentPassword, user.passwordHash))) throw badRequest('Current password is incorrect.');
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(body.newPassword, 12) } });
    await audit(req, 'CHANGE_PASSWORD', 'User', user.id);
    res.json({ ok: true });
  }),
);
