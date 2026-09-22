import pg from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const { Pool } = pg;
// numeric → number, int8 → number
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(1082, (v) => v); // date as YYYY-MM-DD string

export const pool = new Pool({ connectionString: config.databaseUrl, max: 10 });

export type Queryable = pg.Pool | pg.PoolClient;

export async function query<T extends pg.QueryResultRow = any>(text: string, params: any[] = [], q: Queryable = pool): Promise<T[]> {
  const res = await q.query<T>(text, params);
  return res.rows;
}

export async function one<T extends pg.QueryResultRow = any>(text: string, params: any[] = [], q: Queryable = pool): Promise<T | undefined> {
  const rows = await query<T>(text, params, q);
  return rows[0];
}

export async function tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

function migrationsDir() {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, 'migrations');
}

export async function migrate(): Promise<string[]> {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const applied = new Set((await query<{ name: string }>('SELECT name FROM schema_migrations')).map((r) => r.name));
  const files = readdirSync(migrationsDir()).filter((f) => f.endsWith('.sql')).sort();
  const ran: string[] = [];
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = readFileSync(join(migrationsDir(), f), 'utf8');
    await tx(async (c) => {
      await c.query(sql);
      await c.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
    });
    ran.push(f);
  }
  return ran;
}

export async function dropAll(): Promise<void> {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
}

export async function closePool(): Promise<void> {
  await pool.end();
}
