import { defineConfig } from '@playwright/test';
import { existsSync, statSync } from 'node:fs';

// The remote CI/dev container ships Chromium at this path; local machines use Playwright's own download.
const preinstalled = '/opt/pw-browsers/chromium';
const executablePath = existsSync(preinstalled) && statSync(preinstalled).isFile() ? preinstalled : undefined;

const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5173);
const API_PORT = Number(process.env.E2E_API_PORT ?? 4000);

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: executablePath ? { executablePath } : {},
  },
  webServer: [
    {
      command: `npm run start -w server`,
      cwd: '..',
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      env: { PORT: String(API_PORT), DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/brokerverse_e2e', JWT_SECRET: 'e2e-secret', NODE_ENV: 'production', SEED_DEMO: 'true' },
      timeout: 60_000,
    },
    {
      command: `npm run preview -w web -- --port ${WEB_PORT}`,
      cwd: '..',
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      env: { VITE_API_URL: `http://localhost:${API_PORT}` },
      timeout: 60_000,
    },
  ],
});
