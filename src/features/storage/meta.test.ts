import { describe, expect, it } from 'vitest';
import { demoLyrics } from '@/features/lyrics/demo';
import { newProject } from '@/features/projects/project';
import { COVER_TONES, projectMeta, toneFor } from './meta';

describe('projectMeta', () => {
  const project = newProject({ title: 'Marea de luz', artist: 'Demo', lyrics: demoLyrics() });

  it('summarizes a project for the library listing', () => {
    const meta = projectMeta(project, 'abc', 1234);
    expect(meta).toMatchObject({
      id: 'abc',
      title: 'Marea de luz',
      artist: 'Demo',
      updatedAt: 1234,
      kind: 'syllable',
      lineCount: 11,
    });
    expect(meta.preview).toHaveLength(3);
    expect(meta.preview[1]).toBe('como un eco azul'); // the middle line is the one the thumbnail highlights
  });

  it('marks a project as line-timed as soon as one line is', () => {
    const lines = project.lyrics.lines.map((l, i) => (i === 0 ? { ...l, approx: true } : l));
    expect(projectMeta({ ...project, lyrics: { ...project.lyrics, lines } }, 'x', 0).kind).toBe(
      'line',
    );
  });

  it('always gives the same song the same palette, inside the available ones', () => {
    expect(toneFor('Marea de luz', 'Demo')).toBe(toneFor('Marea de luz', 'Demo'));
    for (const title of ['a', 'b', 'c', 'ñandú', '']) {
      expect(toneFor(title, 'x')).toBeLessThan(COVER_TONES);
    }
  });

  it('copes with lyrics shorter than the preview', () => {
    const short = {
      ...project,
      lyrics: { ...project.lyrics, lines: project.lyrics.lines.slice(0, 2) },
    };
    expect(projectMeta(short, 'x', 0).preview).toHaveLength(2);
  });
});
