import { Router } from 'express';
import { z } from 'zod';
import { one, query, tx } from '../db.js';
import { hashPassword, requireModule } from '../lib/auth.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { idParam, parse } from '../lib/validate.js';
import { wrap } from '../lib/async.js';
import { audit } from '../lib/audit.js';
import { ROLES } from '@brokerverse/shared';

export const usersRouter = Router();
usersRouter.use(requireModule('UAM'));

const userCols = 'u.id, u.username, u.full_name, u.email, u.role_code, r.name AS role_name, u.department, u.status, u.last_login_at, u.created_at';

usersRouter.get('/roles', wrap(async (_req, res) => {
  res.json({ roles: await query('SELECT code, name, description, modules, can_approve FROM roles ORDER BY code') });
}));

usersRouter.get('/', wrap(async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const rows = await query(`SELECT ${userCols} FROM users u JOIN roles r ON r.code = u.role_code WHERE ($1 = '' OR u.username ILIKE '%'||$1||'%' OR u.full_name ILIKE '%'||$1||'%') ORDER BY u.id`, [q]);
  res.json({ users: rows });
}));

const userSchema = z.object({
  username: z.string().min(3).max(40).regex(/^[a-z0-9._-]+$/i),
  password: z.string().min(6),
  fullName: z.string().min(1),
  email: z.string().email(),
  roleCode: z.string().refine((c) => ROLES.some((r) => r.code === c), 'Unknown role'),
  department: z.string().default(''),
});

usersRouter.post('/', wrap(async (req, res) => {
  const b = parse(userSchema, req.body);
  const exists = await one('SELECT 1 FROM users WHERE lower(username) = lower($1)', [b.username]);
  if (exists) throw conflict('Username already exists');
  const row = await tx(async (c) => {
    const r = await one<any>('INSERT INTO users(username, password_hash, full_name, email, role_code, department) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [b.username, await hashPassword(b.password), b.fullName, b.email, b.roleCode, b.department], c);
    await audit(c, req.user, 'user.create', 'user', r.id, null, { username: b.username, roleCode: b.roleCode });
    return r;
  });
  res.status(201).json({ id: row.id });
}));

usersRouter.patch('/:id', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const b = parse(z.object({
    fullName: z.string().min(1).optional(), email: z.string().email().optional(), department: z.string().optional(),
    roleCode: z.string().optional(), status: z.enum(['active', 'disabled']).optional(), password: z.string().min(6).optional(),
  }), req.body);
  const before = await one<any>('SELECT id, full_name, email, department, role_code, status FROM users WHERE id=$1', [id]);
  if (!before) throw notFound('User not found');
  if (b.roleCode && !ROLES.some((r) => r.code === b.roleCode)) throw badRequest('Unknown role');
  if (id === req.user!.id && (b.roleCode || b.status)) throw forbidden('Segregation of duties: you cannot change your own role or status');
  await tx(async (c) => {
    await query(`UPDATE users SET full_name = COALESCE($2, full_name), email = COALESCE($3, email), department = COALESCE($4, department),
      role_code = COALESCE($5, role_code), status = COALESCE($6, status), password_hash = COALESCE($7, password_hash), updated_at = now() WHERE id = $1`,
      [id, b.fullName ?? null, b.email ?? null, b.department ?? null, b.roleCode ?? null, b.status ?? null, b.password ? await hashPassword(b.password) : null], c);
    const { password: _pw, ...after } = b;
    await audit(c, req.user, 'user.update', 'user', id, before, after);
  });
  res.json({ ok: true });
}));
