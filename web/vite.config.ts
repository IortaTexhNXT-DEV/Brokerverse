import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': { target: process.env.VITE_API_URL ?? 'http://localhost:4000', changeOrigin: true } } },
  preview: { port: 5173, proxy: { '/api': { target: process.env.VITE_API_URL ?? 'http://localhost:4000', changeOrigin: true } } },
  build: { outDir: 'dist', sourcemap: false },
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], include: ['src/**/*.test.{ts,tsx}'], css: false },
});
