import 'dotenv/config';

const isTest = process.env.NODE_ENV === 'test' || !!process.env.VITEST;

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: isTest
    ? (process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/brokerverse_test')
    : (process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/brokerverse'),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  mailFrom: process.env.MAIL_FROM ?? 'no-reply@brokerverse.local',
  isTest,
};
