// Post-deploy smoke test: `npm run smoke -- https://zh3marea.<subdomain>.workers.dev`
// Checks the pages, the redirect, the 404 page and the headers that matter, against a running site. Exit code 1 on any failure.

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: npm run smoke -- <site url>   e.g. npm run smoke -- http://127.0.0.1:8787');
  process.exit(2);
}
const base = new URL(arg);
if (base.protocol !== 'https:' && base.protocol !== 'http:') {
  console.error(`Not an http(s) URL: ${arg}`);
  process.exit(2);
}

const PAGES = ['/', '/en/', '/app/', '/privacidad/', '/en/privacy/'];
let failures = 0;

function check(ok, label, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}${!ok && detail ? `  (${detail})` : ''}`);
}

const get = (path, init) => fetch(new URL(path, base), { redirect: 'manual', ...init });

function checkSecurityHeaders(label, response, { wasm }) {
  const h = (name) => response.headers.get(name) ?? '';
  const csp = h('content-security-policy');
  check(
    csp.includes("default-src 'self'"),
    `${label}: Content-Security-Policy present`,
    csp || 'missing',
  );
  check(csp.includes("frame-ancestors 'none'"), `${label}: CSP forbids framing`);
  check(!/'unsafe-(inline|eval)'/.test(csp), `${label}: CSP has no unsafe-inline or unsafe-eval`);
  check(
    csp.includes("'wasm-unsafe-eval'") === wasm,
    `${label}: CSP ${wasm ? 'allows' : 'does not allow'} WebAssembly`,
  );
  check(
    h('x-content-type-options') === 'nosniff',
    `${label}: X-Content-Type-Options: nosniff`,
    h('x-content-type-options'),
  );
  check(
    h('x-frame-options').toUpperCase() === 'DENY',
    `${label}: X-Frame-Options: DENY`,
    h('x-frame-options'),
  );
  check(
    h('referrer-policy') === 'strict-origin-when-cross-origin',
    `${label}: Referrer-Policy`,
    h('referrer-policy'),
  );
  check(
    h('permissions-policy').includes('camera=()'),
    `${label}: Permissions-Policy`,
    h('permissions-policy'),
  );
  check(h('cache-control') === 'no-cache', `${label}: Cache-Control: no-cache`, h('cache-control'));
  if (base.protocol === 'https:') {
    check(
      h('strict-transport-security').includes('max-age='),
      `${label}: Strict-Transport-Security`,
    );
  }
}

console.log(`Smoke test for ${base.origin}\n`);

for (const path of PAGES) {
  try {
    const response = await get(path);
    check(response.status === 200, `GET ${path} is 200`, String(response.status));
    if (path === '/' || path === '/app/') {
      checkSecurityHeaders(`GET ${path}`, response, { wasm: path === '/app/' });
    }
    if (path === '/app/') {
      const html = await response.text();
      const script = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
      check(Boolean(script), 'GET /app/ links a hashed script');
      if (script) {
        const asset = await get(script);
        check(asset.status === 200, `GET ${script} is 200`, String(asset.status));
        check(
          asset.headers.get('cache-control') === 'public, max-age=31536000, immutable',
          'hashed assets are cached for a year',
          asset.headers.get('cache-control') ?? 'missing',
        );
      }
    }
  } catch (error) {
    check(
      false,
      `GET ${path} is reachable`,
      error instanceof Error ? error.message : String(error),
    );
  }
}

try {
  const redirect = await get('/app');
  const location = redirect.headers.get('location') ?? '';
  check(
    redirect.status >= 300 && redirect.status < 400 && new URL(location, base).pathname === '/app/',
    'GET /app redirects to /app/',
    `${String(redirect.status)} ${location}`,
  );
} catch (error) {
  check(false, 'GET /app is reachable', error instanceof Error ? error.message : String(error));
}

try {
  const missing = await get(`/smoke-${Math.random().toString(36).slice(2)}`);
  const body = await missing.text();
  check(missing.status === 404, 'an unknown path is 404', String(missing.status));
  check(body.includes('data-locale='), 'the 404 response is the styled 404 page');
} catch (error) {
  check(
    false,
    'an unknown path is reachable',
    error instanceof Error ? error.message : String(error),
  );
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${String(failures)} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
