import { expect, fulfillJson, test } from './guard';
import type { Page } from '@playwright/test';

const ORIGIN = 'http://127.0.0.1:8787';
const TINY_COVER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAADklEQVQI12P4z8DwHwcAAf8A/Q1y4T8AAAAASUVORK5CYII=',
  'base64',
);
const LRCLIB_TRACK = {
  id: 77,
  trackName: 'Brisa Nocturna',
  artistName: 'Artista Sol',
  albumName: '',
  duration: 192,
  instrumental: false,
  syncedLyrics: '[00:05.00] Brisa nocturna\n[00:09.00] Sobre el mar\n[00:13.00] Y la luna',
  hasWordSync: false,
  lyricsfile: '',
};

/** One second of silence as a 16-bit mono WAV, enough for the browser to decode. */
function silentWav(): Buffer {
  const rate = 8000;
  const data = Buffer.alloc(rate * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

async function mockServices(page: Page): Promise<void> {
  await page.route('https://lrclib.net/api/**', (route) =>
    route.request().url().includes('/api/search')
      ? fulfillJson(route, [LRCLIB_TRACK])
      : fulfillJson(route, LRCLIB_TRACK),
  );
  await page.route('https://api.spicylyrics.org/**', (route) => fulfillJson(route, {}));
}

async function openDemoInEditor(page: Page): Promise<void> {
  await page.goto('/app/');
  await page.getByRole('button', { name: 'Probar con la canción demo' }).click();
  await expect(page).toHaveURL(/\/app\/#editor$/);
  // The preview runs CanvasKit (WebAssembly) in a worker, so this is ready only if that worker may compile it.
  await expect(page.getByRole('main').getByRole('button', { name: 'Reproducir' })).toBeEnabled({
    timeout: 30_000,
  });
}

test.describe('the app under its policy', () => {
  test('walks every screen, the editor tabs, the palette and the data dialog', async ({ page }) => {
    await mockServices(page);
    await openDemoInEditor(page);

    for (const tab of ['Estilo', 'Fondo', 'Audio', 'Marca de agua', 'Anzuelo']) {
      await page.getByRole('tab', { name: tab }).click();
      await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
    }
    await page.getByRole('main').getByRole('button', { name: 'Reproducir' }).click();
    await page.waitForTimeout(600);

    await page.getByRole('link', { name: 'Buscar' }).click();
    await page.getByRole('searchbox', { name: 'Buscar canción' }).fill('brisa');
    await expect(page.getByText('Brisa Nocturna')).toBeVisible();
    await page.getByRole('button', { name: 'Crear clip' }).first().click();
    await expect(page).toHaveURL(/\/app\/#editor$/);

    await page.getByRole('link', { name: 'Biblioteca' }).click();
    await expect(page.getByRole('button', { name: 'Abrir Brisa Nocturna' })).toBeVisible();
    await page.getByRole('link', { name: /Exportaciones/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Exportaciones' })).toBeVisible();
    await page.getByRole('link', { name: 'Inicio' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();

    await page.getByRole('link', { name: 'Ajustes' }).click();
    await page.getByLabel('Clave de acceso').fill('sl_pk_prueba');
    await page.getByRole('button', { name: 'Probar clave' }).click();
    await expect(page.getByText('La clave funciona')).toBeVisible();
    await page.getByRole('button', { name: 'Borrar todos mis datos' }).click();
    const dialog = page.getByRole('dialog', { name: '¿Borrar todos tus datos?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByRole('link', { name: 'Privacidad' })).toHaveAttribute(
      'href',
      '/privacidad/',
    );

    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog', { name: 'Buscar o ir a' })).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('decodes a local audio file and keeps it in the private file system', async ({ page }) => {
    await openDemoInEditor(page);
    await page.getByRole('tab', { name: 'Audio' }).click();
    await page.getByRole('button', { name: 'Archivo de audio' }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Elegir archivo…' }).click();
    await (
      await chooser
    ).setFiles({ name: 'silencio.wav', mimeType: 'audio/wav', buffer: silentWav() });
    await expect(page.getByText(/silencio\.wav/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel('Forma de onda del audio')).toBeVisible();
  });

  test('connects a mocked Spotify: login callback, now playing, covers and cover download', async ({
    page,
  }) => {
    await mockServices(page);
    await page.route('https://accounts.spotify.com/api/token', (route) =>
      fulfillJson(route, {
        access_token: 'mock-access',
        refresh_token: 'mock-refresh',
        expires_in: 3600,
      }),
    );
    const track = {
      id: 'spTrack001',
      name: 'Luz de Marea',
      artists: [{ name: 'Artista Demo' }],
      album: {
        name: 'Album Demo',
        images: [{ url: 'https://i.scdn.co/image/demo-cover', width: 640 }],
      },
      duration_ms: 185000,
      uri: 'spotify:track:spTrack001',
    };
    await page.route('https://api.spotify.com/v1/me/player/currently-playing', (route) =>
      fulfillJson(route, {
        is_playing: true,
        progress_ms: 12000,
        timestamp: 1_700_000_000_000,
        item: { type: 'track', ...track },
      }),
    );
    await page.route('https://api.spotify.com/v1/search*', (route) =>
      fulfillJson(route, {
        tracks: { items: [{ ...track, id: 'spTrack002', name: 'Brisa Nocturna' }] },
      }),
    );
    await page.route('https://i.scdn.co/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'image/png',
        headers: { 'access-control-allow-origin': '*' },
        body: TINY_COVER_PNG,
      }),
    );

    await page.goto('/app/#settings');
    await expect(page.locator('#spotify-redirect-uri')).toHaveValue(`${ORIGIN}/app/`);
    await page.locator('#spotify-client-id').fill('demo-client-id');
    await page.locator('#spotify-client-id').dispatchEvent('change');
    await page.evaluate((origin) => {
      sessionStorage.setItem(
        'zh3marea.spotify.pkce',
        JSON.stringify({
          verifier: 'v',
          state: 'state-xyz',
          redirectUri: `${origin}/app/`,
          returnRoute: 'settings',
        }),
      );
    }, ORIGIN);

    await page.goto('/app/?code=auth-ok&state=state-xyz');
    await expect(page).toHaveURL(/\/app\/#settings$/);
    await expect(page.getByText('Conectado a Spotify').first()).toBeVisible();

    await page.getByRole('link', { name: 'Inicio' }).click();
    await expect(page.getByRole('region', { name: 'Sonando en Spotify' })).toBeVisible();
    await expect(
      page.locator('img[src="https://i.scdn.co/image/demo-cover"]').first(),
    ).toBeVisible();

    await page.getByRole('link', { name: 'Buscar' }).click();
    await page.getByRole('searchbox', { name: 'Buscar canción' }).fill('brisa');
    await expect(page.getByText('Brisa Nocturna')).toBeVisible();
    await page.getByRole('button', { name: 'Crear clip' }).first().click();
    await expect(page).toHaveURL(/\/app\/#editor$/);

    // Only the refresh token is stored; the access token never reaches disk.
    const stored = await page.evaluate(async () => {
      const request = indexedDB.open('zh3marea');
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => {
          resolve(request.result);
        };
        request.onerror = () => {
          reject(new Error('open failed'));
        };
      });
      const read = (key: string) =>
        new Promise<unknown>((resolve) => {
          const get = db.transaction('secrets').objectStore('secrets').get(key);
          get.onsuccess = () => {
            resolve(get.result);
          };
        });
      const result = {
        refresh: await read('spotifyRefreshToken'),
        legacy: await read('spotifyToken'),
      };
      db.close();
      return result;
    });
    expect(stored).toEqual({ refresh: 'mock-refresh', legacy: undefined });

    await page.getByRole('link', { name: 'Ajustes' }).click();
    await page.getByRole('button', { name: 'Desconectar', exact: true }).click();
    await expect(page.getByText('Sin conectar').first()).toBeVisible();
  });

  test('exports a clip through the interface and downloads the MP4', async ({ page }) => {
    test.setTimeout(150_000);
    await openDemoInEditor(page);
    await page.getByRole('button', { name: /Camino solo por la ciudad/ }).click();
    await expect(page.getByText(/Versos 1–1/)).toBeVisible();
    await page.getByLabel('Formato').selectOption('square');

    await page.getByRole('button', { name: 'Exportar', exact: true }).click();
    await expect(page.getByText(/Exportación en cola/)).toBeVisible();
    await page.getByRole('link', { name: /Exportaciones/ }).click();

    const download = page.getByRole('button', { name: 'Descargar' });
    await expect(download).toBeVisible({ timeout: 120_000 });
    const saved = page.waitForEvent('download');
    await download.click();
    expect((await saved).suggestedFilename()).toMatch(/\.mp4$/);

    await page.getByRole('link', { name: 'Biblioteca' }).click();
    await page.getByRole('button', { name: 'Clips' }).click();
    await expect(page.getByRole('button', { name: /Descargar: Marea de luz/ })).toBeVisible();
  });
});
