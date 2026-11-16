import { describe, expect, it } from 'vitest';
import { summarizeQueue, type ExportJob, type ExportState } from './queue';

const job = (id: string, state: ExportState): ExportJob => ({ id, title: id, artist: 'x', state });

describe('summarizeQueue', () => {
  it('is empty for no jobs', () => {
    expect(summarizeQueue([])).toEqual({ pending: 0, progress: null });
  });

  it('counts queued and rendering jobs only', () => {
    const jobs = [
      job('a', { kind: 'done' }),
      job('b', { kind: 'rendering', progress: 0.25, etaSeconds: 30 }),
      job('c', { kind: 'queued' }),
      job('d', { kind: 'failed', message: 'no encoder' }),
      job('e', { kind: 'cancelled' }),
    ];
    expect(summarizeQueue(jobs)).toEqual({ pending: 2, progress: 0.25 });
  });

  it('reports no progress while jobs are only queued', () => {
    expect(summarizeQueue([job('a', { kind: 'queued' })])).toEqual({ pending: 1, progress: null });
  });

  it('clamps progress into 0..1', () => {
    const jobs = [job('a', { kind: 'rendering', progress: 1.4, etaSeconds: null })];
    expect(summarizeQueue(jobs).progress).toBe(1);
  });
});
