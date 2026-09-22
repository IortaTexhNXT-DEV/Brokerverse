import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db.js';
import { loadUser, requireAuth, signToken, verifyPassword } from '../lib/auth.js';
import { unauthorized, forbidden } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { wrap } from '../lib/async.js';
import { audit } from '../lib/audit.js';
import { pool } from '../db.js';

export const authRouter = Router();

authRouter.post('/login', wrap(async (req, res) => {
  const { username, password } = parse(z.object({ username: z.string().min(1), password: z.string().min(1) }), req.body);
  const row = await one<any>('SELECT id, password_hash, status FROM users WHERE lower(username) = lower($1)', [username]);
  if (!row || !(await verifyPassword(password, row.password_hash))) throw unauthorized('Invalid username or password');
  if (row.status !== 'active') throw forbidden('User is disabled');
  const user = (await loadUser(row.id))!;
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  await audit(pool, user, 'auth.login', 'user', user.id, null, null);
  res.json({ token: signToken(user), user });
}));

authRouter.get('/me', requireAuth, (req, res) => { res.json({ user: req.user }); });
