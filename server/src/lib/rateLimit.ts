import type { Request, Response, NextFunction } from 'express';
import { HttpError } from './errors.js';

interface Bucket { count: number; resetAt: number }

/** In-memory fixed-window limiter for the login endpoint (per client IP + username). Swap for Redis in a multi-node deployment. */
export function loginRateLimiter(limit: number, windowMs: number) {
  const buckets = new Map<string, Bucket>();
  const sweep = () => { const now = Date.now(); for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k); };
  const timer = setInterval(sweep, windowMs);
  timer.unref();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip}|${String(req.body?.username ?? '').toLowerCase()}`;
    const now = Date.now();
    const b = buckets.get(key);
    if (!b || b.resetAt <= now) { buckets.set(key, { count: 1, resetAt: now + windowMs }); return next(); }
    b.count++;
    if (b.count > limit) {
      res.setHeader('Retry-After', String(Math.ceil((b.resetAt - now) / 1000)));
      return next(new HttpError(429, 'Too many sign-in attempts; try again later'));
    }
    return next();
  };
}
