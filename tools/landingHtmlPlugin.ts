import type { Plugin } from 'vite';
import { resolveSiteConfig } from '../src/shared/site';
import {
  renderLandingHtml,
  renderNotFoundHtml,
  renderPrivacyHtml,
  renderRobotsTxt,
  renderSitemapXml,
} from './renderLanding';

const HTML_WITH_FONT = [
  'index.html',
  'en/index.html',
  'privacidad/index.html',
  'en/privacy/index.html',
  '404.html',
];

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
        if (pathname === '/robots.txt') {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(renderRobotsTxt());
          return;
        }
        if (pathname === '/sitemap.xml') {
          res.setHeader('Content-Type', 'application/xml; charset=utf-8');
          res.end(renderSitemapXml());
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
        if (normalized.endsWith('/en/privacy/index.html')) return renderPrivacyHtml('en');
        if (normalized.endsWith('/privacidad/index.html')) return renderPrivacyHtml('es-MX');
        if (normalized.endsWith('/404.html')) return renderNotFoundHtml();
        if (normalized.endsWith('/en/index.html')) return renderLandingHtml('en');
        if (normalized.endsWith('/index.html')) return renderLandingHtml('es-MX');
        return html;
      },
    },
    generateBundle(_options, bundle) {
      const fontAsset = Object.keys(bundle).find((name) =>
        /assets\/InterTight-Latin.*\.woff2$/i.test(name),
      );
      if (fontAsset) {
        for (const name of HTML_WITH_FONT) {
          const entry = bundle[name];
          if (entry?.type === 'asset' && typeof entry.source === 'string') {
            entry.source = entry.source.replace(
              '/src/landing/fonts/InterTight-Latin.woff2',
              `/${fontAsset}`,
            );
          }
        }
      }
      if (!process.env.VITE_SITE_URL) {
        this.warn(
          'VITE_SITE_URL is not set: canonical, hreflang, Open Graph, robots.txt and sitemap.xml use the placeholder ' +
            `${resolveSiteConfig().siteUrl}. Set it to the real address before deploying (docs/deploy.md).`,
        );
      }
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: renderRobotsTxt() });
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: renderSitemapXml() });
    },
  };
}
