import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';
import { zh3mareaPwaPlugin } from './tools/pwaPlugin';

export default defineConfig({
  plugins: [svelte(), zh3mareaPwaPlugin()],
  worker: { format: 'es' },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Spotify rejects "localhost" redirect URIs, so the dev server binds the loopback IP.
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
  },
});
