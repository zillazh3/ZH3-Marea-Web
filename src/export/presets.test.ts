import { describe, expect, it } from 'vitest';
import { EXPORT_PRESETS, clipFilename, safeFilename } from './presets';

describe('export presets and filenames', () => {
  it('uses even dimensions for all H.264 presets', () => {
    for (const spec of Object.values(EXPORT_PRESETS)) {
      expect(spec.width % 2).toBe(0);
      expect(spec.height % 2).toBe(0);
    }
  });

  it('sanitizes filenames and reserved Windows stems', () => {
    expect(safeFilename('  Hola: <mundo>?  ', 'clip')).toBe('Hola mundo');
    expect(safeFilename('con', 'clip')).toBe('_con');
    expect(safeFilename('...', 'fallback')).toBe('fallback');
  });

  it('formats clip filenames matching desktop conventions', () => {
    expect(clipFilename('Artista', 'Marea de luz', 0, 5)).toBe(
      'Artista - Marea de luz (versos 1–6) [ZH3 Marea].mp4',
    );
    expect(clipFilename('', 'Marea de luz', null, null, 'Pleamar')).toBe(
      'Marea de luz (completa) [Pleamar] [ZH3 Marea].mp4',
    );
  });
});
