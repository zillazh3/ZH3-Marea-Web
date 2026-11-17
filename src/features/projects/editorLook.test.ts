import { describe, expect, it } from 'vitest';
import { demoLyrics } from '@/features/lyrics/demo';
import { clipRangeMs, restoreEditorState, serializeEditorState } from './editorLook';
import { newProject } from './project';

describe('editorLook restore and serialize', () => {
  it('defaults to first 6 verses and system reduced-motion preference', () => {
    const project = newProject({ title: 'Demo', artist: 'A', lyrics: demoLyrics() });
    const restored = restoreEditorState(project, true);
    expect([restored.first, restored.last]).toEqual([0, 5]);
    expect(restored.look.params.reduce).toBe(true);
    expect(restored.audioSource).toBe('solo');
    const [start, end] = clipRangeMs(project, restored.first, restored.last);
    expect(start).toBe(6000);
    expect(end).toBeCloseTo(28500, 9);
  });

  it('round-trips snake_case desktop keys and preserves unknown editor fields', () => {
    const project = newProject({ title: 'Demo', artist: 'A', lyrics: demoLyrics() });
    project.editor = {
      first: 2,
      last: 4,
      params: { wob: 0.72, vib: false, reduce: false },
      style: { wm_side: 'right', credit: false, bloom: false },
      fx: { overrides: { '3': ['luz'] } },
      preset: 'Pleamar',
    };
    const restored = restoreEditorState(project, true);
    expect([restored.first, restored.last]).toEqual([2, 4]);
    expect(restored.look.params.wob).toBe(0.72);
    expect(restored.look.params.vib).toBe(false);
    expect(restored.look.params.reduce).toBe(false);
    expect(restored.look.style.wmSide).toBe('right');
    expect(restored.look.style.credit).toBe(false);
    expect(restored.look.style.bloom).toBe(false);
    expect(restored.preset).toBe('Pleamar');

    const serialized = serializeEditorState(project.editor, restored);
    expect((serialized.fx as Record<string, unknown>).overrides).toEqual({ '3': ['luz'] });
    expect((serialized.style as Record<string, unknown>).wm_side).toBe('right');
    expect((serialized.params as Record<string, unknown>).wob).toBe(0.72);
  });
});
