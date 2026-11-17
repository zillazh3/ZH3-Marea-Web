import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // A few stray antialiased pixels between runs are noise, not a visual change.
  expect: { toHaveScreenshot: { maxDiffPixels: 50 } },
  use: { baseURL: 'http://127.0.0.1:5173', locale: 'es-MX' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173/app/',
    reuseExistingServer: !process.env.CI,
  },
});
