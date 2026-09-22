import type { z } from 'zod';
import { badRequest } from './errors.js';

export function parse<S extends z.ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw badRequest('Validation failed', r.error.flatten());
  return r.data;
}

export function idParam(v: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw badRequest('Invalid id');
  return n;
}
