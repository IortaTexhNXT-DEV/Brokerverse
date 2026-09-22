process.env.NODE_ENV = 'test';
export default async function setup() {
  const { dropAll, migrate, closePool } = await import('../src/db.js');
  const { seedBaseline, seedDemo } = await import('../src/seed.js');
  await dropAll();
  await migrate();
  await seedBaseline();
  await seedDemo();
  await closePool();
}
