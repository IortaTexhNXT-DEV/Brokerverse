/**
 * Route kit: the single import every route module needs. Keeps route files free of
 * repeated import headers and gives one place to evolve cross-cutting concerns.
 */
export { Router } from 'express';
export type { Request, Response } from 'express';
export { z } from 'zod';
export { one, pool, query, tx } from '../db.js';
export type { Queryable } from '../db.js';
export { requireApprover, requireModule } from './auth.js';
export type { AuthUser } from './auth.js';
export { wrap } from './async.js';
export { audit } from './audit.js';
export { nextNumber } from './numbering.js';
export { sendMail } from './mail.js';
export { idParam, parse } from './validate.js';
export { badRequest, conflict, forbidden, notFound } from './errors.js';
export { GL, postJournal, today, ensurePeriod, addDays, closeFiscalYear } from '../domain/ledger.js';
export { createApproval } from '../domain/approvals.js';
export { round2 } from '@brokerverse/shared';
