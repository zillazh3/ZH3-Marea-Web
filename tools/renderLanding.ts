import {
  landingMessagesFor,
  type LandingLocale,
  type LandingMessages,
} from '../src/features/i18n/landing';
import {
  LANDING_CORRIENTES,
  WORDFX_CATEGORY_COUNT,
  type LandingCorriente,
} from '../src/shared/landingFacts';
import { resolveSiteConfig, type SiteConfig } from '../src/shared/site';

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function renderPresetCss(
  corrientes: readonly LandingCorriente[] = LANDING_CORRIENTES,
): string {
  const lines = [
    '/* Auto-synced from src/shared/data/presets/*.json via src/shared/landingFacts.ts */',
  ];
  for (const item of corrientes) {
    const { textSizePx, glowFactor, blurPx, dimAlpha } = item.cssVars;
    lines.push(
      `[data-preset='${item.slug}'] {\n  --text-size: ${String(textSizePx)}px;\n  --glow: ${String(glowFactor)};\n  --blur: ${String(blurPx)}px;\n  --dim: ${String(dimAlpha)};\n}`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function renderJsonLd(m: LandingMessages, canonicalUrl: string, site: SiteConfig): string {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: m.meta.appName,
    description: m.meta.description,
    applicationCategory: m.meta.appCategory,
    operatingSystem: 'Web Browser, Windows',
    isAccessibleForFree: true,
    license: 'https://www.gnu.org/licenses/agpl-3.0.html',
    url: canonicalUrl,
    downloadUrl: site.windowsReleaseUrl,
    codeRepository: site.repoUrl,
    author: {
      '@type': 'Person',
      name: site.authorName,
    },
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  };
  return JSON.stringify(data);
}

function renderCorrienteCard(item: LandingCorriente, m: LandingMessages): string {
  const [line1, line2, line3] = m.currents.sampleLines;
  const stats = m.currents.stats;
  const desc = m.currents.descriptions[item.slug];
  return `      <li data-preset="${item.slug}" data-reveal>
        <figure data-cover="${item.cover}"><p>${escapeHtml(line1)}</p><p>${escapeHtml(line2)}</p><p>${escapeHtml(line3)}</p><figcaption>${escapeHtml(item.name)}</figcaption></figure>
        <dl>
          <dt>${escapeHtml(stats.brightness)}</dt><dd>${String(item.brightness)}</dd><dd class="stat-meter"><meter max="100" value="${String(item.brightness)}" aria-label="${escapeHtml(stats.brightness)}"></meter></dd>
          <dt>${escapeHtml(stats.blur)}</dt><dd>${String(item.blur)}</dd><dd class="stat-meter"><meter max="100" value="${String(item.blur)}" aria-label="${escapeHtml(stats.blur)}"></meter></dd>
          <dt>${escapeHtml(stats.effects)}</dt><dd>${String(item.effects)}</dd><dd class="stat-meter"><meter max="100" value="${String(item.effects)}" aria-label="${escapeHtml(stats.effects)}"></meter></dd>
          <dt>${escapeHtml(stats.size)}</dt><dd>${String(item.size)}</dd><dd class="stat-meter"><meter max="${String(item.sizeMax)}" value="${String(item.size)}" aria-label="${escapeHtml(stats.size)}"></meter></dd>
        </dl>
        <p>${escapeHtml(desc)}</p>
      </li>`;
}

export function siteFromEnv(): SiteConfig {
  return resolveSiteConfig({
    VITE_SOURCE_URL: process.env.VITE_SOURCE_URL,
    VITE_SITE_URL: process.env.VITE_SITE_URL,
    VITE_WINDOWS_RELEASE_URL: process.env.VITE_WINDOWS_RELEASE_URL,
  });
}

/** Indexable pages, each with its es-MX and en path. */
const PAGE_PAIRS = [
  { es: '/', en: '/en/' },
  { es: '/privacidad/', en: '/en/privacy/' },
] as const;

export function renderRobotsTxt(site?: SiteConfig): string {
  const resolved = site ?? siteFromEnv();
  return `User-agent: *\nAllow: /\n\nSitemap: ${resolved.siteUrl}/sitemap.xml\n`;
}

export function renderSitemapXml(site?: SiteConfig): string {
  const resolved = site ?? siteFromEnv();
  const urls = PAGE_PAIRS.flatMap((pair) =>
    [pair.es, pair.en].map((path) => ({
      loc: `${resolved.siteUrl}${path}`,
      altEs: `${resolved.siteUrl}${pair.es}`,
      altEn: `${resolved.siteUrl}${pair.en}`,
    })),
  );
  const entries = urls
    .map(
      (entry) => `  <url>
    <loc>${escapeHtml(entry.loc)}</loc>
    <xhtml:link rel="alternate" hreflang="es-MX" href="${escapeHtml(entry.altEs)}" />
    <xhtml:link rel="alternate" hreflang="en" href="${escapeHtml(entry.altEn)}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeHtml(entry.altEs)}" />
  </url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries}
</urlset>
`;
}

const DEFAULT_FONT_HREF = '/src/landing/fonts/InterTight-Latin.woff2';

const LOGO_SVG = `<svg viewBox="0 0 512 512" aria-hidden="true"><defs><linearGradient id="logo-gradient" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse"><stop class="logo-stop-start" offset="0"/><stop class="logo-stop-end" offset="1"/></linearGradient></defs><path d="M136 0H376C460 0 512 52 512 136V376C512 460 460 512 376 512H136C52 512 0 460 0 376V136C0 52 52 0 136 0Z" fill="url(#logo-gradient)"/><path class="logo-wave" d="M88 176.8C113.2 176.8 118.8 143.2 144 143.2S174.8 176.8 200 176.8 230.8 143.2 256 143.2 286.8 176.8 312 176.8 342.8 143.2 368 143.2 398.8 176.8 424 176.8" fill="none" stroke-width="30" stroke-linecap="round" opacity=".55"/><path class="logo-wave" d="M88 224.8C120.4 224.8 127.6 287.2 160 287.2S199.6 224.8 232 224.8 271.6 287.2 304 287.2 343.6 224.8 376 224.8" fill="none" stroke-width="46" stroke-linecap="round"/><path class="logo-wave" d="M88 335.2C113.2 335.2 118.8 368.8 144 368.8S174.8 335.2 200 335.2 230.8 368.8 256 368.8 286.8 335.2 312 335.2 342.8 368.8 368 368.8 398.8 335.2 424 335.2" fill="none" stroke-width="30" stroke-linecap="round" opacity=".55"/><circle class="logo-dot" cx="430" cy="256" r="24"/></svg>`;

interface PageMeta {
  readonly title: string;
  readonly description: string;
  /** Paths of the page in both languages. Omitted for pages that must not be indexed (404). */
  readonly paths?: { readonly es: string; readonly en: string; readonly self: string };
  readonly jsonLd?: string;
}

function renderHead(
  m: LandingMessages,
  site: SiteConfig,
  page: PageMeta,
  fontHref: string,
  extraHead = '',
): string {
  const url = (path: string): string => escapeHtml(`${site.siteUrl}${path}`);
  const ogImage = escapeHtml(`${site.siteUrl}/og-image.png`);
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description);
  const indexing = page.paths
    ? `<link rel="canonical" href="${url(page.paths.self)}">
<link rel="alternate" hreflang="es-MX" href="${url(page.paths.es)}">
<link rel="alternate" hreflang="en" href="${url(page.paths.en)}">
<link rel="alternate" hreflang="x-default" href="${url(page.paths.es)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="${escapeHtml(m.meta.ogLocale)}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${url(page.paths.self)}">
<meta property="og:image" content="${ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${ogImage}">`
    : '<meta name="robots" content="noindex">';
  const jsonLd = page.jsonLd ? `\n<script type="application/ld+json">${page.jsonLd}</script>` : '';
  return `<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${description}">
<meta name="theme-color" content="#0e0d1a">
${indexing}
<link rel="icon" type="image/svg+xml" href="/app/icons/icon.svg">
<link rel="apple-touch-icon" href="/app/icons/apple-touch-icon.png">
<link rel="preload" as="font" type="font/woff2" href="${escapeHtml(fontHref)}" crossorigin>
<link rel="stylesheet" href="/src/landing/styles/landing.css">${jsonLd}${extraHead}
</head>`;
}

/** `home` is '' on the landing itself (in-page anchors) and the landing path ('/' or '/en/') on other pages. */
function renderHeader(m: LandingMessages, site: SiteConfig, home: string): string {
  const logoHref = home === '' ? '#top' : home;
  return `<header class="site-header">
  <a href="${logoHref}" aria-label="${escapeHtml(m.header.logoAria)}">
    ${LOGO_SVG}
    ZH3 Marea
  </a>
  <nav aria-label="${escapeHtml(m.header.navAria)}">
    <a href="${home}#como-se-ve">${escapeHtml(m.header.howItLooks)}</a>
    <a href="${home}#donde">${escapeHtml(m.header.whereToUse)}</a>
    <a href="${home}#corrientes">${escapeHtml(m.header.currents)}</a>
    <a href="${home}#codigo">${escapeHtml(m.header.sourceNav)}</a>
  </nav>
  <a class="button primary" href="${site.appPath}">${escapeHtml(m.header.openApp)}</a>
</header>`;
}

function renderFooter(m: LandingMessages, site: SiteConfig, otherLanguageHref: string): string {
  return `<footer class="site-footer" id="codigo">
  <div>
    <p>${escapeHtml(m.footer.licensePrefix)} <a href="${escapeHtml(site.repoUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(m.footer.sourceLink)}</a>. ${escapeHtml(m.footer.licenseSuffix)}</p>
    <div class="footer-meta">
      <p>${escapeHtml(m.footer.disclaimer)}</p>
      <p><a href="${escapeHtml(m.footer.privacyHref)}">${escapeHtml(m.footer.privacyLink)}</a></p>
      <p>${escapeHtml(m.footer.languageLabel)} <a href="${escapeHtml(otherLanguageHref)}" data-locale-choice="${escapeHtml(m.footer.otherLanguageCode)}" hreflang="${escapeHtml(m.footer.otherLanguageCode)}" lang="${escapeHtml(m.footer.otherLanguageCode)}">${escapeHtml(m.footer.otherLanguageName)}</a></p>
    </div>
  </div>
</footer>`;
}

function renderPrivacySections(m: LandingMessages, site: SiteConfig): string {
  const href = (raw: string): string =>
    escapeHtml(raw.replace('{repo}', site.repoUrl).replace('{issues}', `${site.repoUrl}/issues`));
  const paragraphs = (list: readonly string[]): string =>
    list.map((text) => `    <p>${escapeHtml(text)}</p>`).join('\n');
  return m.privacy.sections
    .map((section, index) => {
      const items = section.items
        .map((item) => {
          const link = item.link
            ? ` <a href="${href(item.link.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.link.label)}</a>`
            : '';
          return `      <li>${escapeHtml(item.text)}${link}</li>`;
        })
        .join('\n');
      const list = items ? `\n    <ul>\n${items}\n    </ul>` : '';
      const closing = section.closing.length > 0 ? `\n${paragraphs(section.closing)}` : '';
      return `  <section aria-labelledby="privacy-${String(index)}">
    <h2 id="privacy-${String(index)}">${escapeHtml(section.heading)}</h2>
${paragraphs(section.paragraphs)}${list}${closing}
  </section>`;
    })
    .join('\n');
}

export function renderPrivacyHtml(
  locale: LandingLocale,
  options?: { readonly site?: SiteConfig; readonly fontHref?: string },
): string {
  const m = landingMessagesFor(locale);
  const site = options?.site ?? siteFromEnv();
  const p = m.privacy;
  const home = locale === 'en' ? '/en/' : '/';
  const otherPath = locale === 'en' ? '/privacidad/' : '/en/privacy/';
  const head = renderHead(
    m,
    site,
    {
      title: p.metaTitle,
      description: p.metaDescription,
      paths: { es: '/privacidad/', en: '/en/privacy/', self: p.path },
    },
    options?.fontHref ?? DEFAULT_FONT_HREF,
  );
  return `<!doctype html>
<html lang="${m.htmlLang}">
${head}
<body>

${renderHeader(m, site, home)}

<main class="doc">
  <h1>${escapeHtml(p.title)}</h1>
  <p class="lead">${escapeHtml(p.intro)}</p>
${renderPrivacySections(m, site)}
  <p class="updated">${escapeHtml(p.updatedLabel)} <time datetime="${escapeHtml(p.updatedIso)}">${escapeHtml(p.updatedText)}</time></p>
</main>

${renderFooter(m, site, otherPath)}
</body>
</html>
`;
}

/** One page for both languages: `not-found.ts` unhides the block that matches `navigator.languages`. */
export function renderNotFoundHtml(options?: {
  readonly site?: SiteConfig;
  readonly fontHref?: string;
}): string {
  const site = options?.site ?? siteFromEnv();
  const es = landingMessagesFor('es-MX');
  const en = landingMessagesFor('en');
  const block = (
    m: LandingMessages,
    home: string,
    hidden: boolean,
  ): string => `  <section class="not-found" lang="${m.htmlLang}" data-locale="${m.htmlLang}"${hidden ? ' hidden' : ''}>
    <p class="code" aria-hidden="true">404</p>
    <h1>${escapeHtml(m.notFound.title)}</h1>
    <p>${escapeHtml(m.notFound.body)}</p>
    <div class="actions">
      <a class="button primary" href="${home}">${escapeHtml(m.notFound.home)}</a>
      <a class="button" href="${site.appPath}">${escapeHtml(m.notFound.app)}</a>
    </div>
  </section>`;
  const head = renderHead(
    es,
    site,
    { title: '404 · ZH3 Marea', description: es.notFound.body },
    options?.fontHref ?? DEFAULT_FONT_HREF,
    '\n<script type="module" src="/src/landing/not-found.ts"></script>',
  );
  return `<!doctype html>
<html lang="${es.htmlLang}">
${head}
<body>
<header class="site-header">
  <a href="/" aria-label="${escapeHtml(es.header.logoAria)}">
    ${LOGO_SVG}
    ZH3 Marea
  </a>
</header>

<main class="doc">
${block(es, '/', false)}
${block(en, '/en/', true)}
</main>
</body>
</html>
`;
}

export function renderLandingHtml(
  locale: LandingLocale,
  options?: {
    readonly site?: SiteConfig;
    readonly fontHref?: string;
  },
): string {
  const m = landingMessagesFor(locale);
  const site = options?.site ?? siteFromEnv();
  const canonicalUrl = locale === 'en' ? `${site.siteUrl}/en/` : `${site.siteUrl}/`;
  const fontHref = options?.fontHref ?? DEFAULT_FONT_HREF;
  const calloutsHtml = m.hero.callouts
    .map((label) => `          <li>${escapeHtml(label)}</li>`)
    .join('\n');
  const storyLinesHtml = m.story.lines
    .map((line) => {
      const fx = line.fx ? ` data-fx="${escapeHtml(line.fx)}"` : '';
      return `            <p data-syllables="${escapeHtml(line.syllables)}"${fx}>${escapeHtml(line.syllables.replaceAll('|', ''))}</p>`;
    })
    .join('\n');
  const corrientesHtml = LANDING_CORRIENTES.map((item) => renderCorrienteCard(item, m)).join('\n');
  const head = renderHead(
    m,
    site,
    {
      title: m.meta.title,
      description: m.meta.description,
      paths: { es: '/', en: '/en/', self: locale === 'en' ? '/en/' : '/' },
      jsonLd: renderJsonLd(m, canonicalUrl, site),
    },
    fontHref,
  );

  return `<!doctype html>
<html lang="${m.htmlLang}">
${head}
<body>

${renderHeader(m, site, '')}

<nav class="page-progress" aria-label="${escapeHtml(m.pageProgress.navAria)}">
  <ol>
    <li><a href="#top" aria-label="${escapeHtml(m.pageProgress.top)}"></a></li>
    <li><a href="#como-se-ve" aria-label="${escapeHtml(m.pageProgress.howItLooks)}"></a></li>
    <li><a href="#donde" aria-label="${escapeHtml(m.pageProgress.whereToUse)}"></a></li>
    <li><a href="#corrientes" aria-label="${escapeHtml(m.pageProgress.currents)}"></a></li>
    <li><a href="#empezar" aria-label="${escapeHtml(m.pageProgress.start)}"></a></li>
  </ol>
</nav>

<main>
  <section class="hero" id="top" aria-labelledby="hero-title">
    <div>
      <h1 id="hero-title">
        <span class="visually-hidden">${escapeHtml(m.hero.screenReaderTitle)}</span>
        <svg viewBox="0 0 1000 250" aria-hidden="true">
          <defs>
            <clipPath id="wordmark-clip"><text x="-6" y="214" textLength="1010" lengthAdjust="spacingAndGlyphs">Marea</text></clipPath>
            <linearGradient id="sea-gradient" x1="0" x2="1" y1="0" y2="1"><stop class="sea-stop-1" offset="0"/><stop class="sea-stop-2" offset=".45"/><stop class="sea-stop-3" offset="1"/></linearGradient>
          </defs>
          <text class="wordmark-ghost" x="-6" y="214" textLength="1010" lengthAdjust="spacingAndGlyphs">Marea</text>
          <g clip-path="url(#wordmark-clip)">
            <g data-wordmark-sea>
              <path class="wave-back wordmark-wave-back" d="M0 12 Q31 0 62.5 12 T125 12 T187.5 12 T250 12 T312.5 12 T375 12 T437.5 12 T500 12 T562.5 12 T625 12 T687.5 12 T750 12 T812.5 12 T875 12 T937.5 12 T1000 12 T1062.5 12 T1125 12 T1187.5 12 T1250 12 V400 H0Z"/>
              <path class="wave-front" fill="url(#sea-gradient)" d="M0 18 Q31 4 62.5 18 T125 18 T187.5 18 T250 18 T312.5 18 T375 18 T437.5 18 T500 18 T562.5 18 T625 18 T687.5 18 T750 18 T812.5 18 T875 18 T937.5 18 T1000 18 T1062.5 18 T1125 18 T1187.5 18 T1250 18 V400 H0Z"/>
            </g>
          </g>
          <text class="wordmark-stroke" x="-6" y="214" textLength="1010" lengthAdjust="spacingAndGlyphs" stroke-width="1.4">Marea</text>
        </svg>
      </h1>

      <div class="hero-text">
        <p>${escapeHtml(m.hero.lead)}</p>
        <p>${escapeHtml(m.hero.sub)}</p>
        <div class="actions">
          <a class="button primary" href="${site.appPath}">${escapeHtml(m.hero.primaryCta)}</a>
          <a class="watch" href="#como-se-ve">${escapeHtml(m.hero.watchCta)}</a>
        </div>
      </div>

      <figure class="hero-phone" aria-hidden="true">
        <div class="phone" data-clip data-cover="ocean"></div>
        <ul>
${calloutsHtml}
        </ul>
      </figure>
    </div>
  </section>

  <section class="story" id="como-se-ve" aria-labelledby="story-title" data-story>
    <div class="story-stage">
      <div>
        <header>
          <h2 class="visually-hidden" id="story-title">${escapeHtml(m.story.title)}</h2>
          <p data-story-hint>${escapeHtml(m.story.hint)}</p>
          <p data-story-count data-verse-template="${escapeHtml(m.story.verseTemplate)}">${escapeHtml(m.story.initialVerse)}</p>
        </header>
        <div class="lyrics">
          <div>
${storyLinesHtml}
          </div>
        </div>
        <div class="story-closing">
          <p>${escapeHtml(m.story.closingText)}</p>
          <a class="button primary" href="${site.appPath}">${escapeHtml(m.story.closingCta)}</a>
        </div>
      </div>
      <div class="sea" aria-hidden="true">
        <svg viewBox="0 0 1600 40" preserveAspectRatio="none"><path d="M0 22 Q50 8 100 22 T200 22 T300 22 T400 22 T500 22 T600 22 T700 22 T800 22 T900 22 T1000 22 T1100 22 T1200 22 T1300 22 T1400 22 T1500 22 T1600 22 V40 H0Z"/></svg>
        <svg viewBox="0 0 1600 40" preserveAspectRatio="none"><path d="M0 20 Q50 4 100 20 T200 20 T300 20 T400 20 T500 20 T600 20 T700 20 T800 20 T900 20 T1000 20 T1100 20 T1200 20 T1300 20 T1400 20 T1500 20 T1600 20 V40 H0Z"/></svg>
      </div>
    </div>
  </section>

  <section class="platforms" id="donde" aria-labelledby="platforms-title">
    <h2 id="platforms-title" data-reveal>${escapeHtml(m.platforms.titleTop)} <span>${escapeHtml(m.platforms.titleAccent)}</span></h2>
    <dl data-reveal>
      <div>
        <dt>${escapeHtml(m.platforms.desktop.title)} <em>${escapeHtml(m.platforms.desktop.accent)}</em></dt>
        <dd>${escapeHtml(m.platforms.desktop.desc)}</dd>
        <dd>${escapeHtml(m.platforms.desktop.badge)}</dd>
      </div>
      <div>
        <dt>${escapeHtml(m.platforms.browser.title)} <em>${escapeHtml(m.platforms.browser.accent)}</em></dt>
        <dd>${escapeHtml(m.platforms.browser.desc)}</dd>
        <dd>${escapeHtml(m.platforms.browser.badge)}</dd>
      </div>
    </dl>
    <div class="feature">
      <article data-reveal>
        <h3>${escapeHtml(m.platforms.tiktok.title)}</h3>
        <p>${escapeHtml(m.platforms.tiktok.p1)}</p>
        <p>${escapeHtml(m.platforms.tiktok.p2)}</p>
      </article>
      <figure aria-hidden="true"><div class="phone" data-clip data-cover="sunset"></div></figure>
      <article data-reveal>
        <h3>${escapeHtml(m.platforms.local.title)}</h3>
        <p>${escapeHtml(m.platforms.local.p1)}</p>
        <p>${escapeHtml(m.platforms.local.p2)}</p>
      </article>
    </div>
  </section>

  <section class="currents" id="corrientes" aria-labelledby="currents-title">
    <header data-reveal>
      <h2 id="currents-title">${escapeHtml(m.currents.titleTop)} <span>${escapeHtml(m.currents.titleAccent)}</span></h2>
      <div>
        <button class="button" type="button" data-scroll-currents="-1">${escapeHtml(m.currents.prev)}</button>
        <button class="button" type="button" data-scroll-currents="1">${escapeHtml(m.currents.next)}</button>
      </div>
    </header>
    <ul data-currents>
${corrientesHtml}
    </ul>
  </section>

  <section class="closing" id="empezar" aria-labelledby="closing-title">
    <div data-reveal>
      <h2 id="closing-title">${escapeHtml(m.closing.title)}</h2>
      <p>${escapeHtml(m.closing.body)}</p>
      <div class="actions">
        <a class="button primary" href="${site.appPath}">${escapeHtml(m.closing.openWeb)}</a>
        <a class="button" href="${escapeHtml(site.windowsReleaseUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(m.closing.downloadWindows)}</a>
      </div>
      <dl>
        <div><dt>${escapeHtml(m.closing.metrics.fpsValue)}</dt><dd>${escapeHtml(m.closing.metrics.fpsLabel)}</dd></div>
        <div><dt>${String(WORDFX_CATEGORY_COUNT)}</dt><dd>${escapeHtml(m.closing.metrics.categoriesLabel)}</dd></div>
        <div><dt>${escapeHtml(m.closing.metrics.zeroValue)}</dt><dd>${escapeHtml(m.closing.metrics.zeroLabel)}</dd></div>
      </dl>
    </div>
  </section>
</main>

${renderFooter(m, site, m.footer.otherLanguageHref)}

<template id="clip-template">
  <div class="clip">
    <header><i></i><span><b>${escapeHtml(m.clipDemo.songTitle)}</b><small>${escapeHtml(m.clipDemo.songArtist)}</small></span></header>
    <div><ol></ol></div>
    <footer>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 9c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/><path d="M2 15c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/></svg>
      ${escapeHtml(m.clipDemo.watermark)}
    </footer>
  </div>
</template>

<script type="module" src="/src/landing/main.ts"></script>
</body>
</html>
`;
}
