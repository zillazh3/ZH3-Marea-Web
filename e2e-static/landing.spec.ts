import type { Page } from '@playwright/test';
import { expect, test } from './guard';

const PAGES = ['/', '/en/', '/privacidad/', '/en/privacy/'];

async function scrollThrough(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const step = Math.max(200, window.innerHeight / 2);
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
}

test.describe('landing, privacy and 404 pages under the strict policy', () => {
  for (const path of PAGES) {
    test(`${path} renders and animates with zero violations or console output`, async ({
      page,
    }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.locator('h1').first()).toBeVisible();
      await scrollThrough(page);
      await expect(page.locator('footer.site-footer')).toBeVisible();
    });
  }

  test('the Corrientes carousel and the footer links work under the policy', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Siguiente/ }).click();
    await page.getByRole('link', { name: 'Privacidad' }).click();
    await expect(page).toHaveURL(/\/privacidad\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Privacidad' })).toBeVisible();
    await page.getByRole('link', { name: 'English' }).click();
    await expect(page).toHaveURL(/\/en\/privacy\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
  });

  test('the 404 page follows the browser language: Spanish', async ({ page, guard }) => {
    guard.expectedOnce.push(/status of 404/);
    const response = await page.goto('/no-such-page');
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Esta página no existe' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ir al inicio' })).toHaveAttribute('href', '/');
    await expect(page.getByRole('link', { name: 'Abrir la app' })).toHaveAttribute('href', '/app/');
  });

  test.describe('english browser', () => {
    test.use({ locale: 'en-US' });

    test('the 404 page follows the browser language: English', async ({ page, guard }) => {
      guard.expectedOnce.push(/status of 404/);
      const response = await page.goto('/no-such-page');
      expect(response?.status()).toBe(404);
      await expect(
        page.getByRole('heading', { level: 1, name: 'This page does not exist' }),
      ).toBeVisible();
      await expect(page.getByRole('link', { name: 'Open the app' })).toHaveAttribute(
        'href',
        '/app/',
      );
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    });
  });
});
