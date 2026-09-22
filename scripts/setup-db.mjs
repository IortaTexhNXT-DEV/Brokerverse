// Creates the application and test databases if they do not exist (works on Windows, macOS and Linux — no createdb needed).
import pg from 'pg';
import { existsSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(new URL('..', import.meta.url).pathname);
if (!existsSync(resolve(root, '.env'))) { copyFileSync(resolve(root, '.env.example'), resolve(root, '.env')); console.log('Created .env from .env.example'); }
const { config } = await import('dotenv'); config({ path: resolve(root, '.env') });
const urls = [process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/brokerverse', process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/brokerverse_test'];
for (const url of urls) {
  const u = new URL(url); const dbName = u.pathname.slice(1); u.pathname = '/postgres';
  const client = new pg.Client({ connectionString: u.toString() });
  try {
    await client.connect();
    const r = await client.query('SELECT 1 FROM pg_database WHERE datname=$1', [dbName]);
    if (r.rowCount) console.log(`database ${dbName} exists`); else { await client.query(`CREATE DATABASE "${dbName}"`); console.log(`created database ${dbName}`); }
  } catch (e) { console.error(`Cannot reach PostgreSQL at ${u.host}: ${e.message}\nStart PostgreSQL (or use: docker compose up db) and check DATABASE_URL in .env`); process.exit(1); }
  finally { await client.end().catch(() => {}); }
}
