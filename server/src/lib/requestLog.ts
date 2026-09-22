import type { Request, Response, NextFunction } from 'express';

/** Structured one-line request log (method, path, status, ms, user) — JSON in production for log shippers. */
export function requestLog(json: boolean) {
  return (req: Request, res: Response, next: NextFunction) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      const entry = { t: new Date().toISOString(), m: req.method, p: req.originalUrl.split('?')[0], s: res.statusCode, ms: Math.round(ms), u: req.user?.username ?? '-', ip: req.ip };
      if (req.originalUrl === '/api/health' || req.originalUrl === '/api/ready') return;
      console.warn(json ? JSON.stringify(entry) : `${entry.m} ${entry.p} ${entry.s} ${entry.ms}ms ${entry.u}`);
    });
    next();
  };
}
