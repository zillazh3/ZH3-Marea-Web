import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { zh3mareaLandingPlugin } from './tools/landingHtmlPlugin';
import { zh3mareaPwaPlugin } from './tools/pwaPlugin';

function trailingSlashRedirectPlugin(): Plugin {
  return {
    name: 'zh3marea-trailing-slash',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url ?? '';
        const [pathname, search] = rawUrl.split('?');
        if (pathname === '/app') {
          res.statusCode = 302;
          res.setHeader('Location', `/app/${search ? `?${search}` : ''}`);
          res.end();
          return;
        }
        next();
      });
    },
  };
}

/** The landing renderer reads `process.env`, so `.env.production` (VITE_SITE_URL and friends) is copied there; real variables win. */
function exposeEnvFiles(mode: string): void {
  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), 'VITE_'))) {
    process.env[key] ??= value;
  }
}

export default defineConfig(({ mode }) => {
  exposeEnvFiles(mode);
  return {
    base: '/',
    plugins: [
      svelte(),
      zh3mareaLandingPlugin(),
      zh3mareaPwaPlugin(),
      trailingSlashRedirectPlugin(),
    ],
    worker: { format: 'es' },
    optimizeDeps: {
      entries: ['app/index.html', 'src/render/preview.worker.ts', 'src/export/export.worker.ts'],
    },
    build: {
      rolldownOptions: {
        input: {
          main: fileURLToPath(new URL('./index.html', import.meta.url)),
          en: fileURLToPath(new URL('./en/index.html', import.meta.url)),
          app: fileURLToPath(new URL('./app/index.html', import.meta.url)),
          privacy: fileURLToPath(new URL('./privacidad/index.html', import.meta.url)),
          privacyEn: fileURLToPath(new URL('./en/privacy/index.html', import.meta.url)),
          notFound: fileURLToPath(new URL('./404.html', import.meta.url)),
        },
      },
    },
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    // Spotify rejects "localhost" redirect URIs, so the dev server binds the loopback IP.
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
    test: {
      include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
      environment: 'node',
    },
  };
});
