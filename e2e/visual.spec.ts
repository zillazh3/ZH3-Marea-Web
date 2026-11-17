import { expect, test } from '@playwright/test';

const SIZES = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
] as const;

const THEMES = ['dark', 'light'] as const;

// Baselines are rendered on the machine that records them.
for (const size of SIZES) {
  for (const colorScheme of THEMES) {
    test(`shell ${size.name} ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto('/app/?seed');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`shell-${size.name}-${colorScheme}.png`, {
        animations: 'disabled',
      });
    });
  }
}
