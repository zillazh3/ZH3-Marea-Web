import { readFileSync } from 'node:fs';
import { expect, test, type Page, type Route } from '@playwright/test';
import type * as Opfs from '../src/features/storage/opfs';

const FIXTURES = 'tests/fixtures';
const TTML = `${FIXTURES}/lyrics/marea-de-luz.ttml`;
const RICH_PROJECT = `${FIXTURES}/project/rich.marea.json`;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET',
};

/** Answers the browser's preflight and the request itself, so tests never reach the real services. */
async function mock(route: Route, status: number, body: unknown): Promise<void> {
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: CORS });
    return;
  }
  await route.fulfill({
    status,
    headers: CORS,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function pickWith(
  page: Page,
  buttonName: string,
  files: string | { name: string; mimeType: string; buffer: Buffer },
): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: buttonName }).click();
  await (await chooser).setFiles(files);
}

test.describe('opening lyrics', () => {
  test('opens the demo song, keeps it in the library and survives a reload', async ({ page }) => {
    await page.goto('/app/');
    await page.getByRole('button', { name: 'Probar con la canción demo' }).click();

    await expect(page).toHaveURL(/\/app\/#editor$/);
    await expect(page.getByRole('heading', { level: 2, name: 'Marea de luz' })).toBeVisible();
    await expect(page.getByText('Abrí «Marea de luz» en el Editor')).toBeVisible();

    await page.reload();
    await page.goto('/app/#library');
    await expect(page.getByRole('button', { name: 'Abrir Marea de luz' })).toBeVisible();
    await page.goto('/app/');
    await expect(page.getByRole('button', { name: 'Abrir Marea de luz' })).toBeVisible();
  });

  test('opens a .ttml file and names the project after the file', async ({ page }) => {
    await page.goto('/app/');
    await pickWith(page, 'Abrir .ttml', TTML);

    await expect(page).toHaveURL(/\/app\/#editor$/);
    await expect(page.getByRole('heading', { level: 2, name: 'marea-de-luz' })).toBeVisible();
    await expect(page.getByText('Letra por sílaba')).toBeVisible();
  });

  test('explains what is wrong with a file that is not lyrics', async ({ page }) => {
    await page.goto('/app/');
    await pickWith(page, 'Abrir .ttml', {
      name: 'notas.ttml',
      mimeType: 'text/plain',
      buffer: Buffer.from('esto no es xml'),
    });

    await expect(page.getByText(/no es un TTML válido/)).toBeVisible();
    await expect(page).toHaveURL(/\/app\/#home$/);
  });

  test('imports a desktop .marea.json and downloads it back unchanged in substance', async ({
    page,
  }) => {
    const original = JSON.parse(readFileSync(RICH_PROJECT, 'utf8')) as {
      title: string;
      schema: string;
      lyrics: { lines: unknown[] };
      cinematic: unknown;
      editor: unknown;
    };

    await page.goto('/app/');
    await pickWith(page, 'Abrir proyecto', RICH_PROJECT);
    await expect(page.getByRole('heading', { level: 2, name: original.title })).toBeVisible();

    await page.goto('/app/#library');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar .marea.json' }).click();
    const saved = await download;
    expect(saved.suggestedFilename()).toBe(`${original.title}.marea.json`);

    const path = await saved.path();
    const roundTripped = JSON.parse(readFileSync(path, 'utf8')) as typeof original;
    expect(roundTripped.schema).toBe(original.schema);
    expect(roundTripped.lyrics.lines).toHaveLength(original.lyrics.lines.length);
    expect(roundTripped.cinematic).toEqual(original.cinematic);
    expect(roundTripped.editor).toEqual(original.editor);
  });

  test('refuses a file that is not a ZH3 Marea project', async ({ page }) => {
    await page.goto('/app/');
    await pickWith(page, 'Abrir proyecto', {
      name: 'otro.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"schema":"otra.cosa","version":1}'),
    });
    await expect(page.getByText('Ese archivo no es un proyecto de ZH3 Marea.')).toBeVisible();
  });
});

test.describe('library', () => {
  test('deletes a project after a second press', async ({ page }) => {
    await page.goto('/app/');
    await page.getByRole('button', { name: 'Probar con la canción demo' }).click();
    await page.goto('/app/#library');

    await page.getByRole('button', { name: 'Eliminar' }).click();
    await expect(page.getByRole('button', { name: '¿Eliminar?' })).toBeVisible();
    await page.getByRole('button', { name: '¿Eliminar?' }).click();

    await expect(page.getByText('Aún no hay nada aquí')).toBeVisible();
  });

  test('shows the empty state for clips', async ({ page }) => {
    await page.goto('/app/#library');
    await page.getByRole('button', { name: 'Clips' }).click();
    await expect(page.getByText('Todavía no hay clips')).toBeVisible();
  });

  test('does not overlap Library filter buttons with the phone settings button', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/app/#library');

    const filterBox = await page.getByRole('group', { name: 'Filtrar biblioteca' }).boundingBox();
    const settingsBox = await page.getByRole('link', { name: 'Ajustes' }).boundingBox();
    expect(filterBox).not.toBeNull();
    expect(settingsBox).not.toBeNull();
    if (!filterBox || !settingsBox) return;

    const overlapsX =
      filterBox.x < settingsBox.x + settingsBox.width &&
      filterBox.x + filterBox.width > settingsBox.x;
    const overlapsY =
      filterBox.y < settingsBox.y + settingsBox.height &&
      filterBox.y + filterBox.height > settingsBox.y;
    expect(overlapsX && overlapsY).toBe(false);
  });
});

test.describe('search', () => {
  const TRACKS = [
    {
      id: 1,
      trackName: 'Marea alta',
      artistName: 'Los Cuervos',
      albumName: '',
      duration: 200,
      instrumental: false,
      syncedLyrics: '[00:01.00] Hola mundo\n[00:04.00] Segundo verso\n[00:08.00] Tercero',
      hasWordSync: false,
      lyricsfile: '',
    },
    {
      id: 2,
      trackName: 'Marea baja',
      artistName: 'Los Cuervos',
      albumName: '',
      duration: 180,
      instrumental: false,
      syncedLyrics: '',
      hasWordSync: false,
      lyricsfile: '',
    },
  ];

  test('lists results with their lyrics badge and opens one', async ({ page }) => {
    await page.route('https://lrclib.net/api/search*', (route) => mock(route, 200, TRACKS));
    await page.goto('/app/#search');
    await page.getByRole('searchbox', { name: 'Buscar canción' }).fill('marea');

    await expect(page.getByText('Marea alta')).toBeVisible();
    await expect(page.getByText('Letra por línea')).toBeVisible();
    await expect(page.getByText('Sin letra sincronizada')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Crear clip' }).last()).toBeDisabled();

    await page.getByRole('button', { name: 'Crear clip' }).first().click();
    await expect(page).toHaveURL(/\/app\/#editor$/);
    await expect(page.getByRole('heading', { level: 2, name: 'Marea alta' })).toBeVisible();
  });

  test('says so when nothing matches', async ({ page }) => {
    await page.route('https://lrclib.net/api/search*', (route) => mock(route, 200, []));
    await page.goto('/app/#search');
    await page.getByRole('searchbox', { name: 'Buscar canción' }).fill('zzzz');
    await expect(page.getByText('No encontré resultados')).toBeVisible();
  });

  test('explains a service outage', async ({ page }) => {
    await page.route('https://lrclib.net/api/search*', (route) => mock(route, 503, {}));
    await page.goto('/app/#search');
    await page.getByRole('searchbox', { name: 'Buscar canción' }).fill('marea');
    await expect(page.getByRole('alert')).toHaveText(/LRCLIB está ocupado/);
  });
});

test.describe('settings', () => {
  test('keeps the Spicy Lyrics key and tests it', async ({ page }) => {
    await page.route('https://api.spicylyrics.org/**', (route) => mock(route, 200, {}));
    await page.goto('/app/#settings');
    await page.getByLabel('Clave de acceso').fill('sl_pk_prueba');
    await page.getByRole('button', { name: 'Probar clave' }).click();
    await expect(page.getByText('La clave funciona')).toBeVisible();

    await page.reload();
    await expect(page.getByLabel('Clave de acceso')).toHaveValue('sl_pk_prueba');
  });

  test('says when Spicy rejects the key', async ({ page }) => {
    await page.route('https://api.spicylyrics.org/**', (route) => mock(route, 401, {}));
    await page.goto('/app/#settings');
    await page.getByLabel('Clave de acceso').fill('mala');
    await page.getByRole('button', { name: 'Probar clave' }).click();
    await expect(page.getByText(/Spicy Lyrics no aceptó la clave/)).toBeVisible();
  });

  test('switches language by hand and remembers it', async ({ page }) => {
    await page.goto('/app/#settings');
    await page.getByLabel('Idioma').selectOption('en');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
  });
});

test.describe('english system', () => {
  test.use({ locale: 'en-US' });

  test('detects the language and localizes errors', async ({ page }) => {
    await page.goto('/app/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Home');
    await pickWith(page, 'Open .ttml', {
      name: 'x.ttml',
      mimeType: 'text/plain',
      buffer: Buffer.from('nope'),
    });
    await expect(page.getByText(/isn't valid TTML/)).toBeVisible();
  });
});

test.describe('browser storage', () => {
  test('writes and reads a large file in the origin private file system', async ({ page }) => {
    await page.goto('/app/');
    const result = await page.evaluate(async () => {
      const path = '/src/features/storage/opfs.ts'; // served by the dev server; a variable keeps the bundler out of it
      const { writeFile, readFile, removeFile } = (await import(
        /* @vite-ignore */ path
      )) as typeof Opfs;
      const bytes = new Uint8Array(2_000_000).map((_, i) => i % 251);
      await writeFile(['audio'], 'prueba.bin', new Blob([bytes]));
      const back = await readFile(['audio'], 'prueba.bin');
      const read = back ? new Uint8Array(await back.arrayBuffer()) : null;
      await removeFile(['audio'], 'prueba.bin');
      const gone = await readFile(['audio'], 'prueba.bin');
      return { size: read?.length ?? -1, sample: read?.[1000] ?? -1, gone: gone === null };
    });
    expect(result).toEqual({ size: 2_000_000, sample: 1000 % 251, gone: true });
  });
});
