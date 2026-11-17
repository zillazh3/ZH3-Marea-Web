import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultParams } from '@/engine/params';
import { BUILTIN_PRESETS } from '@/features/presets/builtins';
import type { PresetError } from '@/features/presets/errors';
import {
  PRESET_MAX_BYTES,
  PRESET_SECTIONS,
  applyPreset,
  changedSections,
  currentPresetValues,
  defaultBackgroundFields,
  defaultFxSettings,
  parsePresetText,
  presetFromEditorState,
  presetSignature,
  validatePreset,
  type LookState,
  type PresetDocument,
  type PresetSection,
} from '@/features/presets/schema';
import { defaultStyle } from '@/render/style';
import { at } from '@/shared/indexed';
import type { JsonObject } from '@/shared/json';

interface PresetsFixture {
  builtins: { name: string; signature: string; preset: PresetDocument }[];
  validated: { preset: PresetDocument; flags: string[] };
  partialApply: {
    partial: PresetDocument;
    colorOnlyStyle: { textRgb: [number, number, number]; bloom: boolean; wob: number };
    diffAfterColor: PresetSection[];
    diffAfterAll: PresetSection[];
  };
  fromState: Record<PresetSection, JsonObject>;
}

const fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/presets/cases.json'), 'utf8'),
) as PresetsFixture;

function defaultLook(): LookState {
  return {
    style: defaultStyle(),
    params: defaultParams(),
    background: defaultBackgroundFields(),
    fx: defaultFxSettings(),
  };
}

describe('Corrientes presets parity against desktop', () => {
  it('loads the 4 built-in presets in canonical order with unique signatures', async () => {
    expect(BUILTIN_PRESETS.map((b) => b.name)).toEqual(fixture.builtins.map((b) => b.name));
    const sigs = new Set<string>();
    for (let i = 0; i < BUILTIN_PRESETS.length; i += 1) {
      const actual = at(BUILTIN_PRESETS, i);
      const expected = at(fixture.builtins, i);
      expect(actual.preset).toEqual(expected.preset);
      const sig = await presetSignature(actual.preset);
      expect(sig).toMatch(/^[0-9a-f]{16}$/);
      sigs.add(sig);
    }
    expect(sigs.size).toBe(BUILTIN_PRESETS.length);
  });

  it('validates, clamps, strips unknown keys, and flags unavailable fonts like desktop', () => {
    const dirty: JsonObject = {
      schema: 'marea.preset',
      version: 1,
      name: `  Mi Look Muy Largo ${'x'.repeat(80)}`,
      description: '  desc  ',
      unknown_top: 42,
      tipografia: { font_family: 'Comic Sans MS', font_frac: 0.99, extra: 1 },
      color: {
        text_rgb: `${String.fromCharCode(35)}12ab34`,
        glow_rgb: 'bad',
        glow_gain: -5,
        bloom: 'yes',
      },
      fondo: { bg_blur: 9.0, bg_veil: -1.0, source: 'invalid' },
      efectos: { motion: 'invalid_mode', wob: 0.01, vib: false },
      marca_de_agua: { wm_side: 'right', wm_alpha: 2.5 },
    };

    const res = validatePreset(dirty);
    expect(res.flags).toEqual([{ kind: 'missingFont', font: 'Comic Sans MS' }]);
    for (const sec of PRESET_SECTIONS) {
      expect(res.preset[sec]).toEqual(fixture.validated.preset[sec]);
    }
    expect(res.preset.name).toBe(fixture.validated.preset.name);
    expect(res.preset.description).toBe(fixture.validated.preset.description);
  });

  it('applies chosen sections only and tracks changedSections accurately', () => {
    const { partial, colorOnlyStyle, diffAfterColor, diffAfterAll } = fixture.partialApply;
    const base = defaultLook();
    const afterColor = applyPreset(partial, base, ['color']);
    expect([...afterColor.style.textRgb]).toEqual(colorOnlyStyle.textRgb);
    expect(afterColor.style.bloom).toBe(colorOnlyStyle.bloom);
    expect(afterColor.params.wob).toBe(colorOnlyStyle.wob);
    expect(changedSections(partial, currentPresetValues(afterColor))).toEqual(diffAfterColor);

    const afterAll = applyPreset(partial, afterColor, PRESET_SECTIONS);
    expect(changedSections(partial, currentPresetValues(afterAll))).toEqual(diffAfterAll);
  });

  it('extracts partial preset from saved project.editor state', () => {
    const actual = presetFromEditorState({
      style: { text_rgb: [10, 20, 30], wm_text: 'Web', bloom: false },
      params: { wob: 0.75, motion: 'onda' },
      fx: { fx_intensity: 1.2, adapt_bg: false },
    });
    expect(actual).toEqual(fixture.fromState);
  });

  it('rejects oversized, malformed, or wrong-schema preset JSONs', () => {
    expect(() => parsePresetText('x'.repeat(PRESET_MAX_BYTES + 1))).toThrow(
      expect.objectContaining({ code: 'tooLarge' }) as PresetError,
    );
    expect(() => parsePresetText('not json')).toThrow(
      expect.objectContaining({ code: 'invalidJson' }) as PresetError,
    );
    expect(() => parsePresetText('{"schema":"other","version":1}')).toThrow(
      expect.objectContaining({ code: 'unsupportedSchema' }) as PresetError,
    );
    expect(() => parsePresetText('{"schema":"marea.preset","version":9}')).toThrow(
      expect.objectContaining({ code: 'unsupportedVersion' }) as PresetError,
    );
  });
});
