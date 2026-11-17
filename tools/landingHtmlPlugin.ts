import type { Plugin } from 'vite';
import { renderLandingHtml } from './renderLanding';

export function zh3mareaLandingPlugin(): Plugin {
  return {
    name: 'zh3marea-landing',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url ?? '';
        const [pathname, search] = rawUrl.split('?');
        if (pathname === '/en') {
          res.statusCode = 302;
          res.setHeader('Location', `/en/${search ? `?${search}` : ''}`);
          res.end();
          return;
        }
        next();
      });
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const normalized = ctx.filename.replaceAll('\\', '/');
        if (normalized.endsWith('/app/index.html')) return html;
        if (normalized.endsWith('/en/index.html')) return renderLandingHtml('en');
        if (normalized.endsWith('/index.html')) return renderLandingHtml('es-MX');
        return html;
      },
    },
    generateBundle(_options, bundle) {
      const fontAsset = Object.keys(bundle).find((name) =>
        /assets\/InterTight-Latin.*\.woff2$/i.test(name),
      );
      if (!fontAsset) return;
      for (const name of ['index.html', 'en/index.html']) {
        const entry = bundle[name];
        if (entry?.type === 'asset' && typeof entry.source === 'string') {
          entry.source = entry.source.replace(
            '/src/landing/fonts/InterTight-Latin.woff2',
            `/${fontAsset}`,
          );
        }
      }
    },
  };
}
