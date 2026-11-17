import { expect, test } from '@playwright/test';

const TINY_COVER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAADklEQVQI12P4z8DwHwcAAf8A/Q1y4T8AAAAASUVORK5CYII=',
  'base64',
);

test.describe('Spotify PKCE, search, now-playing and PWA shell', () => {
  test('connects via mocked OAuth callback, shows now-playing on Home, and creates project from Spotify Search', async ({
    page,
  }) => {
    await page.route('https://accounts.spotify.com/api/token', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-sp-access',
          refresh_token: 'mock-sp-refresh',
          expires_in: 3600,
        }),
      });
    });

    await page.route('https://api.spotify.com/v1/me/player/currently-playing', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          is_playing: true,
          progress_ms: 12000,
          timestamp: 1700000000000,
          item: {
            type: 'track',
            id: 'spTrack001',
            name: 'Luz de Marea',
            artists: [{ name: 'Artista Demo' }],
            album: {
              name: 'Álbum Demo',
              images: [{ url: 'https://i.scdn.co/image/demo-cover', width: 640 }],
            },
            duration_ms: 185000,
            uri: 'spotify:track:spTrack001',
          },
        }),
      });
    });

    await page.route('https://api.spotify.com/v1/search*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tracks: {
            items: [
              {
                id: 'spTrack002',
                name: 'Brisa Nocturna',
                artists: [{ name: 'Artista Sol' }],
                album: {
                  name: 'Single',
                  images: [{ url: 'https://i.scdn.co/image/demo-cover', width: 640 }],
                },
                duration_ms: 192000,
                uri: 'spotify:track:spTrack002',
              },
            ],
          },
        }),
      });
    });

    await page.route('https://i.scdn.co/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'image/png', body: TINY_COVER_PNG });
    });

    await page.route('https://lrclib.net/api/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/api/search')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 77,
              trackName: 'Brisa Nocturna',
              artistName: 'Artista Sol',
              duration: 192,
              syncedLyrics: '[00:05.00] Brisa nocturna\n[00:09.00] Sobre el mar',
            },
          ]),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 77,
          trackName: 'Brisa Nocturna',
          artistName: 'Artista Sol',
          duration: 192,
          syncedLyrics: '[00:05.00] Brisa nocturna\n[00:09.00] Sobre el mar',
        }),
      });
    });

    // Save Client ID in Settings and check live Redirect URI
    await page.goto('/settings');
    await expect(page.locator('#spotify-redirect-uri')).toHaveValue(
      'http://127.0.0.1:5173/callback',
    );
    await page.locator('#spotify-client-id').fill('demo-client-id');
    await page.locator('#spotify-client-id').dispatchEvent('change');

    // Seed PKCE state as startConnect does, then hit /callback
    await page.evaluate(() => {
      sessionStorage.setItem(
        'zh3marea.spotify.pkce',
        JSON.stringify({
          verifier: 'test-verifier',
          state: 'state-xyz',
          redirectUri: 'http://127.0.0.1:5173/callback',
          returnRoute: 'settings',
        }),
      );
    });
    await page.goto('/callback?code=auth-ok&state=state-xyz');
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByText('Conectado a Spotify').first()).toBeVisible();

    // Home now displays Sonando en Spotify card
    await page.goto('/');
    await expect(page.getByRole('region', { name: 'Sonando en Spotify' })).toBeVisible();
    await expect(page.getByText('Luz de Marea')).toBeVisible();

    // Search queries Spotify when connected and creates a clip with cover + LRCLIB lyrics
    await page.goto('/search');
    await expect(page.getByText(/Conectado a Spotify/)).toBeVisible();
    await page.getByRole('searchbox', { name: 'Buscar canción' }).fill('Brisa');
    await expect(page.getByText('Brisa Nocturna')).toBeVisible();
    await page.getByRole('button', { name: 'Crear clip' }).click();
    await expect(page).toHaveURL(/\/editor$/);
    await expect(page.getByRole('heading', { name: 'Brisa Nocturna' })).toBeVisible();
  });

  test('serves valid PWA manifest, icons, and service worker script', async ({ request }) => {
    const manifestRes = await request.get('/manifest.webmanifest');
    expect(manifestRes.status()).toBe(200);
    const manifest = (await manifestRes.json()) as {
      name: string;
      display: string;
      icons: { src: string }[];
    };
    expect(manifest.name).toBe('ZH3 Marea');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.length).toBeGreaterThanOrEqual(4);

    const iconRes = await request.get('/icons/icon-192.png');
    expect(iconRes.status()).toBe(200);

    const swRes = await request.get('/sw.js');
    expect(swRes.status()).toBe(200);
    expect(swRes.headers()['content-type']).toContain('javascript');
  });
});
