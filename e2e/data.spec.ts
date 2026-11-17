import { expect, test } from '@playwright/test';

test.describe('data hygiene', () => {
  test('"Borrar todos mis datos" lists what goes, offers a backup and clears every store', async ({
    page,
  }) => {
    // The app registers a fresh service worker as soon as it reloads, so watch the unregister call instead of the end state.
    const unregistered: string[] = [];
    await page.exposeFunction('reportUnregister', (scope: string) => unregistered.push(scope));
    await page.addInitScript(() => {
      const original = ServiceWorkerRegistration.prototype.unregister;
      ServiceWorkerRegistration.prototype.unregister = function unregister() {
        (window as unknown as { reportUnregister: (scope: string) => void }).reportUnregister(
          this.scope,
        );
        return original.call(this);
      };
    });
    await page.goto('/app/');
    await page.getByRole('button', { name: 'Probar con la canción demo' }).click();
    await expect(page).toHaveURL(/\/app\/#editor$/);
    await page.goto('/app/#library');
    await expect(page.getByRole('button', { name: 'Abrir Marea de luz' })).toBeVisible();
    await page.evaluate(() => {
      localStorage.setItem('zh3marea.preferences', '{"theme":"light"}');
      sessionStorage.setItem('zh3marea.spotify.pkce', '{}');
    });

    await page.goto('/app/#settings');
    await page.getByRole('button', { name: 'Borrar todos mis datos' }).click();
    const dialog = page.getByRole('dialog', { name: '¿Borrar todos tus datos?' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Tus proyectos y los audios que cargaste.')).toBeVisible();

    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Descargar mis proyectos (1)' }).click();
    expect((await download).suggestedFilename()).toBe('Marea de luz.marea.json');

    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.evaluate(() => localStorage.length)).resolves.toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Borrar todos mis datos' }).click();
    await dialog.getByRole('button', { name: 'Borrar todo' }).click();
    await page.waitForURL(/\/app\/$/);
    await expect(page.getByRole('button', { name: 'Probar con la canción demo' })).toBeVisible();

    const left = await page.evaluate(async () => ({
      local: localStorage.length,
      session: sessionStorage.length,
    }));
    expect(left.local).toBe(0);
    expect(left.session).toBe(0);
    // The fresh page load recreates an empty database, so check that it holds no project.
    await page.goto('/app/#library');
    await expect(page.getByRole('button', { name: 'Abrir Marea de luz' })).toHaveCount(0);
    expect(unregistered.some((scope) => scope.endsWith('/app/'))).toBe(true);
  });
});
