import { expect, test } from '@playwright/test';

const HASH_SCREENS = [
  { hash: '#home', heading: 'Inicio' },
  { hash: '#search', heading: 'Buscar' },
  { hash: '#library', heading: 'Biblioteca' },
  { hash: '#editor', heading: 'Editor' },
  { hash: '#exports', heading: 'Exportaciones' },
  { hash: '#settings', heading: 'Ajustes' },
] as const;

test('navigates between screens and keeps the hash URL in sync', async ({ page }) => {
  await page.goto('/app/');
  await expect(page).toHaveURL(/\/app\/#home$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inicio');

  await page.getByRole('link', { name: 'Biblioteca' }).click();
  await expect(page).toHaveURL(/\/app\/#library$/);

  await page.getByRole('link', { name: 'Editor' }).click();
  await expect(page).toHaveURL(/\/app\/#editor$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Editor');
  await expect(page).toHaveTitle('Editor – ZH3 Marea');
  await expect(page.getByRole('main')).toBeFocused();
});

test('reloads every hash route without server help', async ({ page }) => {
  for (const screen of HASH_SCREENS) {
    await page.goto(`/app/${screen.hash}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(screen.heading);
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/app/${screen.hash}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(screen.heading);
  }
});

test('supports browser back and forward across hash routes', async ({ page }) => {
  await page.goto('/app/#home');
  await page.getByRole('link', { name: 'Biblioteca' }).click();
  await expect(page).toHaveURL(/\/app\/#library$/);

  await page.getByRole('link', { name: 'Ajustes' }).click();
  await expect(page).toHaveURL(/\/app\/#settings$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ajustes');

  await page.goBack();
  await expect(page).toHaveURL(/\/app\/#library$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Biblioteca');

  await page.goBack();
  await expect(page).toHaveURL(/\/app\/#home$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inicio');

  await page.goForward();
  await expect(page).toHaveURL(/\/app\/#library$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Biblioteca');
});

test('sends an unknown hash to home', async ({ page }) => {
  await page.goto('/app/#nope');
  await expect(page).toHaveURL(/\/app\/#home$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inicio');
});

test.describe('english browser', () => {
  test.use({ locale: 'en-US' });

  test('detects the language from the browser', async ({ page }) => {
    await page.goto('/app/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Home');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});
