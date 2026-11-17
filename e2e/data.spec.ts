import { expect, test } from '@playwright/test';

test.describe('data hygiene', () => {
  test('"Borrar todos mis datos" lists what goes, offers a backup and clears every store', async ({
    page,
  }) => {
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
    expect(await page.evaluate(() => localStorage.length)).toBeGreaterThan(0);

    // The wipe ends by loading /app/ again, which registers a fresh service worker. Serve a blank page there to inspect the end state.
    await page.route('**/app/', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>blank</title>' }),
    );
    await page.getByRole('button', { name: 'Borrar todos mis datos' }).click();
    await dialog.getByRole('button', { name: 'Borrar todo' }).click();

    await expect
      .poll(() =>
        page.evaluate(async () => ({
          local: localStorage.length,
          session: sessionStorage.length,
          databases: (await indexedDB.databases()).map((db) => db.name),
          caches: await caches.keys(),
          registrations: (await navigator.serviceWorker.getRegistrations()).length,
          opfs: await (async () => {
            const names: string[] = [];
            for await (const name of (await navigator.storage.getDirectory()).keys()) {
              names.push(name);
            }
            return names;
          })(),
        })),
      )
      .toEqual({
        local: 0,
        session: 0,
        databases: [],
        caches: [],
        registrations: 0,
        opfs: [],
      });

    await page.unroute('**/app/');
    await page.goto('/app/#library');
    await expect(page.getByRole('button', { name: 'Abrir Marea de luz' })).toHaveCount(0);
  });

  test('reminds about projects that were never downloaded, at most once a week', async ({
    page,
  }) => {
    const reminder = page.getByText('Tienes 1 proyecto que nunca descargaste.', { exact: false });
    await page.goto('/app/');
    await page.getByRole('button', { name: 'Probar con la canción demo' }).click();
    await expect(page).toHaveURL(/\/app\/#editor$/);

    await page.goto('/app/#library');
    await expect(reminder).toBeVisible();
    await page.getByRole('button', { name: 'Entendido' }).click();
    await expect(reminder).toBeHidden();

    // Shown once: a reload within the week stays quiet.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Abrir Marea de luz' })).toBeVisible();
    await expect(reminder).toBeHidden();

    // A week later the reminder returns, until the project has been downloaded.
    const longAgo = (): Promise<void> =>
      page.evaluate(() => {
        const state = JSON.parse(localStorage.getItem('zh3marea.backup') ?? '{}') as object;
        localStorage.setItem('zh3marea.backup', JSON.stringify({ ...state, shownAt: 1 }));
      });
    await longAgo();
    await page.reload();
    await expect(reminder).toBeVisible();

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar .marea.json' }).click();
    await download;
    await longAgo();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Abrir Marea de luz' })).toBeVisible();
    await expect(reminder).toBeHidden();
  });
});
