import { expect, test, type Page } from '@playwright/test';
import type { ExportRunResult } from '@/export/exportClient';

async function openDemoInEditor(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Probar con la canción demo' }).click();
  await expect(page).toHaveURL(/\/editor$/);
  await expect(page.getByRole('main').getByRole('button', { name: 'Reproducir' })).toBeEnabled({
    timeout: 20_000,
  });
}

interface DeterminismResults {
  readonly a: ExportRunResult;
  readonly b: ExportRunResult;
  readonly flash: ExportRunResult;
}

test.describe('export', () => {
  test('renders identical pre-encode frame hashes across two runs and flashes frame 0', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto('/');

    await page.addScriptTag({
      type: 'module',
      content: `
        import { runExportWorker } from '/src/export/exportClient.ts';
        import { defaultParams } from '/src/engine/params.ts';
        import { defaultStyle } from '/src/render/style.ts';
        import { demoLyrics } from '/src/features/lyrics/demo.ts';

        const runOne = (marker) =>
          runExportWorker(
            {
              id: 'det-' + marker + '-' + String(Math.random()),
              lyrics: demoLyrics(),
              coverBytes: null,
              demoCoverLabel: true,
              params: defaultParams(),
              style: defaultStyle(),
              startMs: 12000,
              endMs: 12600,
              width: 540,
              height: 960,
              fps: 60,
              marker,
              hasAudio: false,
              audioLeft: null,
              audioRight: null,
              audioSampleRate: 48000,
              opfsName: null,
              hashFrameIndices: [0, 15, 30],
              hashOnly: true,
            },
            () => undefined,
          ).promise;

        window.__mareaDeterminism = async () => {
          const a = await runOne('none');
          const b = await runOne('none');
          const flash = await runOne('flash');
          return { a, b, flash };
        };
      `,
    });

    await page.waitForFunction(() => '__mareaDeterminism' in window, undefined, {
      timeout: 10_000,
    });

    const result = await page.evaluate(async (): Promise<DeterminismResults> => {
      const w = window as unknown as { __mareaDeterminism: () => Promise<DeterminismResults> };
      return w.__mareaDeterminism();
    });

    expect(result.a.kind).toBe('done');
    expect(result.b.kind).toBe('done');
    expect(result.flash.kind).toBe('done');

    expect(result.a.frameHashes[0]).toBeTruthy();
    expect(result.a.frameHashes[0]).toBe(result.b.frameHashes[0]);
    expect(result.a.frameHashes[15]).toBe(result.b.frameHashes[15]);
    expect(result.a.frameHashes[30]).toBe(result.b.frameHashes[30]);
    expect(result.a.frameHashes[0]).not.toBe(result.a.frameHashes[30]);

    expect(result.flash.frameHashes[0]).not.toBe(result.a.frameHashes[0]);
    expect(result.flash.frameHashes[15]).toBe(result.a.frameHashes[15]);
    expect(result.flash.frameHashes[30]).toBe(result.a.frameHashes[30]);
  });

  test('exports a clip from Editor to Exportaciones, downloads an MP4, and lists it in Library', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openDemoInEditor(page);

    // Narrow to verse 1 so the real 60 fps encode finishes briskly in headless Chromium.
    await page.getByRole('button', { name: /Camino solo por la ciudad/ }).click();
    await expect(page.getByText(/Versos 1–1/)).toBeVisible();

    await page.getByLabel('Formato').selectOption('square');
    await expect(page.getByText(/1080×1080 a 60 fps/)).toBeVisible();

    await page.getByRole('button', { name: 'Opciones de exportación' }).click();
    const menu = page.getByRole('menu', { name: 'Opciones de exportación' });
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitemradio', { name: /Flash/ }).click();
    await expect(menu).toBeHidden();

    await page.getByRole('button', { name: 'Exportar', exact: true }).click();
    await expect(page.getByText(/Exportación en cola/)).toBeVisible();

    const navLink = page.getByRole('link', { name: /Exportaciones/ });
    await navLink.click();
    await expect(page).toHaveURL(/\/exports$/);

    const downloadBtn = page.getByRole('button', { name: 'Descargar' });
    await expect(downloadBtn).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(/Listo/)).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await downloadBtn.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.mp4$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk as Uint8Array));
    }
    const bytes = Buffer.concat(chunks);
    expect(bytes.byteLength).toBeGreaterThan(1024);
    expect(bytes.subarray(4, 8).toString('ascii')).toBe('ftyp');

    // Verify the finished clip also appears under Library -> Clips.
    await page.getByRole('link', { name: 'Biblioteca' }).click();
    await page.getByRole('button', { name: 'Clips' }).click();
    await expect(page.getByRole('button', { name: /Descargar: Marea de luz/ })).toBeVisible();

    // Verify clearFinished clears completed jobs and shows empty state.
    await page.getByRole('link', { name: /Exportaciones/ }).click();
    await page.getByRole('button', { name: 'Limpiar terminadas' }).click();
    await expect(page.getByText('Todavía no hay exportaciones')).toBeVisible();
  });
});
