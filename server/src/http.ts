import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'ERROR',
    public details?: unknown,
  ) {
    super(message);
  }
}
export const badRequest = (m: string, details?: unknown) => new HttpError(400, m, 'BAD_REQUEST', details);
export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`, 'NOT_FOUND');
export const conflict = (m: string, details?: unknown) => new HttpError(409, m, 'CONFLICT', details);
export const forbidden = (m = 'Forbidden') => new HttpError(403, m, 'FORBIDDEN');
export const unauthorized = (m = 'Authentication required') => new HttpError(401, m, 'UNAUTHORIZED');

/** Wrap async handlers so rejections reach the error middleware. */
export const h =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

/** Parse + validate with zod; throws a 400 with field details. */
export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) throw zodToHttp(r.error);
  return r.data;
}

export function zodToHttp(e: ZodError) {
  const details = e.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
  return badRequest(details.map((d) => (d.field ? `${d.field}: ${d.message}` : d.message)).slice(0, 3).join('; '), details);
}

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
export const toDbDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
