import { closePool, dropAll, migrate } from './db.js';
import { seedBaseline, seedDemo } from './seed.js';

const cmd = process.argv[2];
async function main() {
  if (cmd === 'migrate') { console.log('Applied:', await migrate()); }
  else if (cmd === 'seed') { await migrate(); await seedBaseline(); await seedDemo(); console.log('Seeded baseline + demo data'); }
  else if (cmd === 'reset') { await dropAll(); await migrate(); await seedBaseline(); await seedDemo(); console.log('Database reset and seeded'); }
  else { console.error('Usage: cli <migrate|seed|reset>'); process.exit(2); }
  await closePool();
}
main().catch((e) => { console.error(e); process.exit(1); });
