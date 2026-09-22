import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { one } from '../db.js';
import { forbidden, unauthorized } from './errors.js';
import type { ModuleCode } from '@brokerverse/shared';

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  email: string;
  roleCode: string;
  roleName: string;
  department: string;
  status: 'active' | 'disabled';
  modules: string[];
  canApprove: boolean;
}

declare module 'express-serve-static-core' {
  interface Request { user?: AuthUser }
}

export async function loadUser(id: number): Promise<AuthUser | undefined> {
  const row = await one<any>(
    `SELECT u.id, u.username, u.full_name, u.email, u.role_code, u.department, u.status, r.name AS role_name, r.modules, r.can_approve
     FROM users u JOIN roles r ON r.code = u.role_code WHERE u.id = $1`, [id]);
  if (!row) return undefined;
  return {
    id: row.id, username: row.username, fullName: row.full_name, email: row.email, roleCode: row.role_code, roleName: row.role_name,
    department: row.department, status: row.status, modules: row.modules, canApprove: row.can_approve,
  };
}

export function signToken(user: AuthUser): string {
  return jwt.sign({ sub: String(user.id), username: user.username, role: user.roleCode }, config.jwtSecret, { expiresIn: config.jwtExpiresIn } as jwt.SignOptions);
}

export const hashPassword = (p: string) => bcrypt.hash(p, 8);
export const verifyPassword = (p: string, hash: string) => bcrypt.compare(p, hash);

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const h = req.headers.authorization ?? '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : undefined;
    if (!token) throw unauthorized('Missing bearer token');
    let payload: jwt.JwtPayload;
    try { payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload; } catch { throw unauthorized('Invalid or expired token'); }
    const user = await loadUser(Number(payload.sub));
    if (!user) throw unauthorized('Unknown user');
    if (user.status !== 'active') throw forbidden('User is disabled');
    req.user = user;
    next();
  } catch (e) { next(e); }
}

/** Server-side entitlement: the caller's persona must own the module. Hand-typed URLs are refused. */
export function requireModule(...modules: ModuleCode[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const u = req.user;
    if (!u) return next(unauthorized());
    if (!modules.some((m) => u.modules.includes(m))) return next(forbidden(`Persona ${u.roleName} is not entitled to ${modules.join('/')}`));
    next();
  };
}

export function requireApprover(req: Request, _res: Response, next: NextFunction) {
  if (!req.user?.canApprove) return next(forbidden('Only checker personas may approve or reject'));
  next();
}
