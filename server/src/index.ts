import type { Server } from 'node:http';
import { createApp } from './app.js';
import { config } from './config.js';
import { closePool, migrate } from './db.js';
import { seedBaseline, seedDemo } from './seed.js';

async function main() {
  const ran = await migrate();
  if (ran.length) console.warn(`Applied migrations: ${ran.join(', ')}`);
  await seedBaseline();
  if (config.seedDemo || process.env.SEED_DEMO === 'true') await seedDemo();
  const app = createApp();
  const server: Server = app.listen(config.port, () => console.warn(`BrokerVerse API listening on http://localhost:${config.port} (${config.isProd ? 'production' : 'development'})`));

  // Graceful shutdown: stop accepting connections, finish in-flight requests, close the pool.
  const shutdown = (signal: string) => {
    console.warn(`${signal} received; shutting down`);
    server.close(async () => { await closePool(); process.exit(0); });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((e) => { console.error(e); process.exit(1); });
