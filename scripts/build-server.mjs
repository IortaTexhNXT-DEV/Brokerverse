import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(new URL('..', import.meta.url).pathname);
const server = resolve(root, 'server');
await build({ entryPoints: [resolve(server, 'src/index.ts')], bundle: true, platform: 'node', format: 'esm', target: 'node20', outfile: resolve(server, 'dist/index.js'),
  external: ['express', 'cors', 'helmet', 'pg', 'zod', 'jsonwebtoken', 'bcryptjs', 'dotenv'], logLevel: 'info' });
rmSync(resolve(server, 'dist/migrations'), { recursive: true, force: true });
mkdirSync(resolve(server, 'dist'), { recursive: true });
cpSync(resolve(server, 'src/migrations'), resolve(server, 'dist/migrations'), { recursive: true });
