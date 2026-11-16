import { expect, test } from '@playwright/test';

test('navigates between screens and keeps the URL in sync', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inicio');

  await page.getByRole('link', { name: 'Biblioteca' }).click();
  await expect(page).toHaveURL(/\/library$/);

  await page.getByRole('link', { name: 'Editor' }).click();
  await expect(page).toHaveURL(/\/editor$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Editor');
  await expect(page).toHaveTitle('Editor – ZH3 Marea');
  await expect(page.getByRole('main')).toBeFocused();
});

test('opens a deep link directly', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ajustes');
});

test('sends an unknown path to home', async ({ page }) => {
  await page.goto('/nope');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inicio');
});

test.describe('english browser', () => {
  test.use({ locale: 'en-US' });

  test('detects the language from the browser', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Home');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});
