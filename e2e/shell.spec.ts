import { expect, test, type Page } from '@playwright/test';

const RAIL_EXPANDED = 240;
const RAIL_COLLAPSED = 76;

test.use({ colorScheme: 'dark', viewport: { width: 1440, height: 900 } });

async function railWidth(page: Page): Promise<number> {
  const box = await page.getByRole('navigation', { name: 'Principal' }).boundingBox();
  return Math.round(box?.width ?? 0);
}

test.describe('navigation', () => {
  test('marks the active screen and moves the tide with it', async ({ page }) => {
    await page.goto('/');
    const rail = page.getByRole('navigation', { name: 'Principal' });
    await expect(rail.getByRole('link', { name: 'Inicio' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await rail.getByRole('link', { name: 'Biblioteca' }).click();
    await expect(page).toHaveURL(/\/library$/);
    await expect(rail.getByRole('link', { name: 'Biblioteca' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(rail.getByRole('link', { name: 'Inicio' })).not.toHaveAttribute('aria-current');

    await expect
      .poll(async () => (await page.locator('.tide').boundingBox())?.y)
      .toBeCloseTo(
        (await rail.getByRole('link', { name: 'Biblioteca' }).boundingBox())?.y ?? -1,
        0,
      );
  });

  test('moves focus between items with the arrow keys', async ({ page }) => {
    await page.goto('/');
    const rail = page.getByRole('navigation', { name: 'Principal' });
    await rail.getByRole('link', { name: 'Inicio' }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(rail.getByRole('link', { name: 'Buscar', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(rail.getByRole('link', { name: 'Ajustes' })).toBeFocused();
  });
});

test.describe('command palette', () => {
  test('opens with Ctrl+K, filters ignoring accents and navigates with Enter', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog', { name: 'Buscar o ir a' });
    await expect(palette).toBeVisible();
    await expect(palette.getByRole('combobox')).toBeFocused();

    await palette.getByRole('combobox').fill('exportac');
    await expect(palette.getByRole('option')).toHaveCount(1);
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/exports$/);
    await expect(palette).toBeHidden();
  });

  test('explains when nothing matches and closes with Escape', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Buscar o ir a/ }).click();
    const palette = page.getByRole('dialog', { name: 'Buscar o ir a' });
    await palette.getByRole('combobox').fill('zzz');
    await expect(
      palette.getByText('Nada coincide. Prueba con «editor» o «exportar».'),
    ).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(palette).toBeHidden();
  });

  test('runs actions from the list', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Control+k');
    await page.getByRole('combobox').fill('tema');
    await page.getByRole('option', { name: /Cambiar tema/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});

test.describe('rail', () => {
  test('collapses and expands with Ctrl+B and remembers the choice', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => railWidth(page)).toBe(RAIL_EXPANDED);

    await page.keyboard.press('Control+b');
    await expect.poll(() => railWidth(page)).toBe(RAIL_COLLAPSED);

    await page.reload();
    await expect.poll(() => railWidth(page)).toBe(RAIL_COLLAPSED);

    await page.getByRole('button', { name: 'Expandir menú' }).click();
    await expect.poll(() => railWidth(page)).toBe(RAIL_EXPANDED);
  });

  test('starts collapsed below 1200px unless the user chose otherwise', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.goto('/');
    await expect.poll(() => railWidth(page)).toBe(RAIL_COLLAPSED);

    await page.getByRole('button', { name: 'Expandir menú' }).click();
    await expect.poll(() => railWidth(page)).toBe(RAIL_EXPANDED);
  });

  test('shows a tooltip for collapsed items', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Control+b');
    await page.getByRole('link', { name: 'Biblioteca' }).hover();
    await expect(page.locator('.tip.visible')).toHaveText('Biblioteca');
  });

  test('shows the export count and progress from the queue', async ({ page }) => {
    await page.goto('/?seed');
    const link = page.getByRole('link', { name: /Exportaciones/ });
    await expect(link.getByText('2 trabajos en cola')).toBeAttached();
    await expect(link.locator('.ring')).toBeVisible();
  });
});

test.describe('dock', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('moves the navigation to the bottom and drops the rail header', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Principal' });
    const box = await nav.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.width ?? 0).toBeGreaterThan(box?.height ?? 0);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThan(700);

    await expect(page.getByRole('button', { name: /menú/ })).toHaveCount(0);
    await expect(nav.getByRole('link')).toHaveCount(5);
  });

  test('reaches Ajustes from the top corner', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Ajustes' }).click();
    await expect(page).toHaveURL(/\/settings$/);
  });

  test('shows the mini player above the dock', async ({ page }) => {
    await page.goto('/?seed');
    const player = page.getByRole('group', { name: 'Sonando ahora' });
    await expect(player).toBeVisible();
    await player.getByRole('button', { name: 'Pausar' }).click();
    await expect(player.getByRole('button', { name: 'Reproducir' })).toBeVisible();
  });
});

test.describe('theme', () => {
  test('toggles between light and dark and persists the choice', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.getByRole('button', { name: 'Cambiar a tema claro' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('follows the system theme until the user picks one', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('removes the tide transition', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Buscar', exact: true }).click();
    const duration = await page
      .locator('.tide')
      .evaluate((element) => getComputedStyle(element).transitionDuration);
    expect(duration.split(',').every((part) => parseFloat(part) < 0.01)).toBe(true);
  });
});
