import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Load .env from the repository root first, then the server folder, then the working directory (first match wins per key).
const here = dirname(fileURLToPath(import.meta.url));
for (const candidate of [resolve(here, '../../.env'), resolve(here, '../.env'), join(process.cwd(), '.env')]) {
  if (existsSync(candidate)) loadEnv({ path: candidate });
}

const isTest = process.env.NODE_ENV === 'test' || !!process.env.VITEST;
const isProd = process.env.NODE_ENV === 'production';

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url().default('postgres://postgres:postgres@localhost:5432/brokerverse'),
  TEST_DATABASE_URL: z.string().url().default('postgres://postgres:postgres@localhost:5432/brokerverse_test'),
  JWT_SECRET: z.string().default('dev-secret-change-me'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  CORS_ORIGIN: z.string().default('*'),
  MAIL_FROM: z.string().default('no-reply@brokerverse.local'),
  SEED_DEMO: z.enum(['true', 'false']).default('false'),
  LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(10),      // attempts per window per IP+username
  LOGIN_RATE_WINDOW_SEC: z.coerce.number().int().positive().default(300),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}
const env = parsed.data;

/** Production guard rails: refuse to start with a weak secret or an open CORS policy. */
if (isProd) {
  const problems: string[] = [];
  if (env.JWT_SECRET === 'dev-secret-change-me' || env.JWT_SECRET.length < 32) problems.push('JWT_SECRET must be set to a random value of at least 32 characters');
  if (env.CORS_ORIGIN === '*' && process.env.ALLOW_OPEN_CORS !== 'true') problems.push('CORS_ORIGIN must list the web origin(s) (or set ALLOW_OPEN_CORS=true behind a same-origin proxy)');
  if (problems.length) { console.error(`Refusing to start in production:\n - ${problems.join('\n - ')}`); process.exit(1); }
}

export const config = {
  port: env.PORT,
  databaseUrl: isTest ? env.TEST_DATABASE_URL : env.DATABASE_URL,
  jwtSecret: env.JWT_SECRET,
  jwtExpiresIn: env.JWT_EXPIRES_IN,
  corsOrigin: env.CORS_ORIGIN,
  mailFrom: env.MAIL_FROM,
  seedDemo: env.SEED_DEMO === 'true',
  loginRateLimit: env.LOGIN_RATE_LIMIT,
  loginRateWindowMs: env.LOGIN_RATE_WINDOW_SEC * 1000,
  trustProxy: env.TRUST_PROXY === 'true',
  isTest,
  isProd,
};
