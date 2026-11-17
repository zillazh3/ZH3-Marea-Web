import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

const PRECACHE_EXT_RE = /\.(?:html|js|css|ttf|woff2|svg|png|webmanifest)$/i;
const PUBLIC_SHELL_ASSETS = [
  '/app/',
  '/app/manifest.webmanifest',
  '/app/icons/icon.svg',
  '/app/icons/icon-192.png',
  '/app/icons/icon-512.png',
  '/app/icons/maskable-192.png',
  '/app/icons/maskable-512.png',
  '/app/icons/apple-touch-icon.png',
] as const;

export function buildPrecacheList(bundleFileNames: readonly string[]): string[] {
  const urls = new Set<string>(PUBLIC_SHELL_ASSETS);
  for (const name of bundleFileNames) {
    const clean = name.replace(/^\/+/, '');
    if (
      !clean ||
      clean === 'sw.js' ||
      clean === 'app/sw.js' ||
      clean === '_headers' ||
      clean === 'index.html' ||
      clean === 'en/index.html' ||
      /^assets\/(?:main|en|landing|InterTight-Latin)-/i.test(clean)
    ) {
      continue;
    }
    if (/\.wasm$/i.test(clean) || /\.map$/i.test(clean)) continue;
    if (!PRECACHE_EXT_RE.test(clean)) continue;
    urls.add(`/${clean}`);
  }
  return [...urls].sort();
}

export function precacheVersion(precacheUrls: readonly string[], extraSeed = ''): string {
  const hash = createHash('sha256');
  for (const u of precacheUrls) hash.update(`${u}\n`);
  if (extraSeed) hash.update(extraSeed);
  return hash.digest('hex').slice(0, 10);
}

export function renderServiceWorker(version: string, precacheUrls: readonly string[]): string {
  const urlsJson = JSON.stringify(precacheUrls, null, 2);
  return `// Hand-written PWA service worker generated at build time (ADR 0008, scoped to /app/ per ADR 0012).
const CACHE_NAME = 'zh3marea-${version}';
const PRECACHE = ${urlsJson};
const LAZY_CACHE_RE = /\\.(?:wasm|js|css|ttf|svg|png|webmanifest)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('zh3marea-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    if (url.pathname !== '/app' && !url.pathname.startsWith('/app/')) return;
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put('/app/', copy)));
          }
          return res;
        })
        .catch(() => caches.match('/app/').then((cached) => cached || caches.match('/app/index.html'))),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok && LAZY_CACHE_RE.test(url.pathname)) {
          const copy = res.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)));
        }
        return res;
      });
    }),
  );
});
`;
}

export function zh3mareaPwaPlugin(): Plugin {
  return {
    name: 'zh3marea-pwa',
    configureServer(server) {
      server.middlewares.use('/app/sw.js', (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.end("self.addEventListener('fetch', () => {});\n");
      });
    },
    generateBundle(_options, bundle) {
      const names = Object.keys(bundle);
      const precacheUrls = buildPrecacheList(names);
      const version = precacheVersion(precacheUrls, String(names.length));
      this.emitFile({
        type: 'asset',
        fileName: 'app/sw.js',
        source: renderServiceWorker(version, precacheUrls),
      });
    },
  };
}
