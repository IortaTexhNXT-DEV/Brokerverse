import { createApp } from './app.js';
import { config } from './config.js';
import { migrate } from './db.js';
import { seedBaseline, seedDemo } from './seed.js';

async function main() {
  const ran = await migrate();
  if (ran.length) console.log(`Applied migrations: ${ran.join(', ')}`);
  await seedBaseline();
  if (process.env.SEED_DEMO === 'true') await seedDemo();
  const app = createApp();
  app.listen(config.port, () => console.log(`BrokerVerse API listening on http://localhost:${config.port}`));
}

main().catch((e) => { console.error(e); process.exit(1); });
