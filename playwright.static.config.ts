import { defineConfig, devices } from '@playwright/test';

// Serves the production build (`dist/`) through `wrangler dev`, so `_headers` applies exactly as it will on Cloudflare.
// Run `npm run build` first (the `test:e2e:static` script does).
const ORIGIN = 'http://127.0.0.1:8787';

export default defineConfig({
  testDir: './e2e-static',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  use: { baseURL: ORIGIN, locale: 'es-MX' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx wrangler dev --ip 127.0.0.1 --port 8787',
    url: `${ORIGIN}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
