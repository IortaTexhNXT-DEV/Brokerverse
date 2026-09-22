import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app, as } from './helpers.js';
import { closePool } from '../src/db.js';

afterAll(closePool);

describe('authentication and entitlement', () => {
  it('health is public', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
  it('rejects bad credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'nope' });
    expect(res.status).toBe(401);
  });
  it('logs in and returns persona modules', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'cashier', password: 'Broker@123' });
    expect(res.status).toBe(200);
    expect(res.body.user.roleCode).toBe('CASHIER');
    expect(res.body.user.modules).toContain('OPS');
    expect(res.body.user.modules).not.toContain('UAM');
  });
  it('refuses unauthenticated API calls', async () => {
    const res = await request(app).get('/api/clients');
    expect(res.status).toBe(401);
  });
  it('refuses hand-typed URLs outside the persona entitlement', async () => {
    const res = await as('cashier').get('/api/users');
    expect(res.status).toBe(403);
    const ok = await as('admin').get('/api/users');
    expect(ok.status).toBe(200);
    expect(ok.body.users.length).toBeGreaterThanOrEqual(12);
  });
  it('me returns the current user', async () => {
    const res = await as('claims').get('/api/auth/me');
    expect(res.body.user.username).toBe('claims');
  });
});
