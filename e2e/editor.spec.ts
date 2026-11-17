import { expect, test, type Page } from '@playwright/test';

function makeWavBuffer(durationSec = 0.6, sampleRate = 48000): Buffer {
  const numSamples = Math.round(durationSec * sampleRate);
  const dataBytes = numSamples * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < numSamples; i += 1) {
    const sample = Math.round(16000 * Math.sin((2 * Math.PI * 440 * i) / sampleRate));
    buf.writeInt16LE(sample, 44 + i * 2);
  }
  return buf;
}

async function openDemoInEditor(page: Page): Promise<void> {
  await page.goto('/app/');
  await page.getByRole('button', { name: 'Probar con la canción demo' }).click();
  await expect(page).toHaveURL(/\/app\/#editor$/);
  await expect(page.getByRole('main').getByRole('button', { name: 'Reproducir' })).toBeEnabled({
    timeout: 20_000,
  });
}

test.describe('editor', () => {
  test('renders the demo preview with CanvasKit and hides Cinemático in v1', async ({ page }) => {
    await openDemoInEditor(page);

    const tablist = page.getByRole('tablist', { name: 'Ajustes del clip' });
    await expect(tablist.getByRole('tab')).toHaveCount(5);
    await expect(tablist.getByRole('tab', { name: 'Estilo' })).toBeVisible();
    await expect(tablist.getByRole('tab', { name: 'Fondo' })).toBeVisible();
    await expect(tablist.getByRole('tab', { name: 'Audio' })).toBeVisible();
    await expect(tablist.getByRole('tab', { name: 'Marca de agua' })).toBeVisible();
    await expect(tablist.getByRole('tab', { name: 'Anzuelo' })).toBeVisible();
    await expect(tablist.getByRole('tab', { name: /Cinemático/ })).toHaveCount(0);

    const shot = await page.locator('.preview canvas').screenshot();
    expect(shot.byteLength).toBeGreaterThan(2000);
  });

  test('selects a verse range, plays/pauses, and scrubs', async ({ page }) => {
    await openDemoInEditor(page);

    await expect(page.getByText(/Versos 1–6/)).toBeVisible();
    await page.getByRole('button', { name: /las luces se derriten/ }).click();
    await page.getByRole('button', { name: /Si te pierdo entre la gente/ }).click({
      modifiers: ['Shift'],
    });
    await expect(page.getByText(/Versos 2–5/)).toBeVisible();

    await page.getByRole('button', { name: '+' }).click();
    await expect(page.getByText(/Versos 2–6/)).toBeVisible();
    await page.getByRole('button', { name: '-' }).click();
    await expect(page.getByText(/Versos 2–5/)).toBeVisible();

    const main = page.getByRole('main');
    const playBtn = main.getByRole('button', { name: 'Reproducir' });
    await playBtn.click();
    await expect(main.getByRole('button', { name: 'Pausar' })).toBeVisible();
    await expect(page.locator('.tc')).not.toHaveText(/^0:00\.0 /, { timeout: 5000 });

    await main.getByRole('button', { name: 'Pausar' }).click();
    await expect(main.getByRole('button', { name: 'Reproducir' })).toBeVisible();

    const scrub = page.getByRole('slider', { name: 'Posición del clip' });
    await scrub.fill('500');
    await scrub.dispatchEvent('change');
    await expect(page.locator('.tc')).not.toHaveText(/^0:00\.0 /);
  });

  test('applies Corrientes presets, tracks modifications, and saves a user preset', async ({
    page,
  }) => {
    await openDemoInEditor(page);

    await expect(page.locator('.preset-card img').first()).toBeVisible({ timeout: 20_000 });

    await page.getByRole('option', { name: 'Pleamar' }).click();
    await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
    await expect(page.getByText('Pleamar · aplicada')).toBeVisible();

    await page.getByRole('switch', { name: 'Bloom' }).click();
    await expect(page.getByText('Pleamar · modificado (color)')).toBeVisible();

    await page.getByRole('button', { name: 'Guardar como…' }).click();
    await page.getByRole('textbox', { name: 'Nombre de la Corriente' }).fill('Mi ola');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByText('Corriente «Mi ola» guardada.')).toBeVisible();
    await expect(page.getByRole('option', { name: /Mi ola/ })).toBeVisible();
  });

  test('loads a local audio file, adjusts offset, and switches to Solo letra', async ({ page }) => {
    await openDemoInEditor(page);

    await page.getByRole('tab', { name: 'Audio' }).click();
    await expect(page.getByText(/Vista previa silenciosa/)).toBeVisible();

    await page.getByRole('button', { name: 'Archivo de audio' }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Elegir archivo…' }).click();
    await (
      await chooser
    ).setFiles({
      name: 'prueba.wav',
      mimeType: 'audio/wav',
      buffer: makeWavBuffer(0.6),
    });

    await expect(page.getByText(/prueba\.wav · 0:00\.6/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel('Forma de onda del audio')).toBeVisible();

    const offset = page.getByRole('slider', { name: 'Desfase' });
    await offset.fill('250');
    await offset.dispatchEvent('input');
    await expect(page.getByText('+250 ms')).toBeVisible();

    await page
      .getByRole('tabpanel', { name: 'Audio' })
      .getByRole('button', { name: 'Solo letra' })
      .click();
    await expect(page.getByText(/Vista previa silenciosa/)).toBeVisible();
  });

  test('selects a verse range by holding 1 s and dragging across verses', async ({ page }) => {
    await openDemoInEditor(page);

    const startRow = page.getByRole('button', { name: /las luces se derriten/ });
    const endRow = page.getByRole('button', { name: /como un eco azul/ });
    const startBox = await startRow.boundingBox();
    const endBox = await endRow.boundingBox();
    if (!startBox || !endBox) throw new Error('Missing verse row bounding boxes');

    const startX = startBox.x + startBox.width / 2;
    const startY = startBox.y + startBox.height / 2;
    const endY = endBox.y + endBox.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.waitForTimeout(1150);
    await page.mouse.move(startX, endY, { steps: 8 });
    await page.mouse.up();

    await expect(page.getByText(/Versos 2–4/)).toBeVisible();
  });

  test('works cleanly in phone viewport without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openDemoInEditor(page);

    await expect(page.locator('.preview canvas')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  });

  test('enables experimental wordfx in Settings and shows intensity/debug controls in Style tab', async ({
    page,
  }) => {
    await page.goto('/app/#settings');
    const toggle = page.getByRole('switch', { name: 'Efectos semánticos por palabra' });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');

    await openDemoInEditor(page);
    const fxSlider = page.getByRole('slider', { name: 'Intensidad FX' });
    await expect(fxSlider).toBeVisible();
    await expect(
      page.getByRole('switch', { name: 'Adaptar color de efectos al fondo' }),
    ).toBeVisible();

    const debugSwitch = page.getByRole('switch', { name: 'Depurar efectos por palabra' });
    await debugSwitch.click();
    await expect(debugSwitch).toHaveAttribute('aria-checked', 'true');

    const shot = await page.locator('.preview canvas').screenshot();
    expect(shot.byteLength).toBeGreaterThan(2000);
  });

  test('suggests ranges in Anzuelo, highlights on hover, applies range, and queues variants', async ({
    page,
  }) => {
    await openDemoInEditor(page);

    await page.getByRole('tab', { name: 'Anzuelo' }).click();
    await expect(page.getByText(/Elige una duración/)).toBeVisible();

    await page.getByRole('button', { name: '15 s' }).click();
    await page.getByRole('button', { name: 'Sugerir rangos' }).click();

    const options = page.getByRole('listbox', { name: 'Anzuelo' }).getByRole('option');
    await expect(options.first()).toBeVisible();
    await options.nth(1).hover();
    await expect(page.locator('.vlist button.hover-preview').first()).toBeVisible();
    await options.first().click();
    await expect(page.locator('.range-label')).toHaveText(/Versos 7–9/);

    await page.getByRole('button', { name: 'Encolar variantes…' }).click();
    await expect(
      page.getByRole('region', { name: /Una exportación por cada Corriente/ }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Agregar a la cola' }).click();
    await expect(page.getByText(/\d+ exportaciones añadidas a la cola\./)).toBeVisible();
  });
});
