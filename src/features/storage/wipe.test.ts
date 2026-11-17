import { describe, expect, it } from 'vitest';
import { runWipe, WipeError, type WipeStep } from './wipe';

describe('runWipe', () => {
  it('runs the steps in order', async () => {
    const order: string[] = [];
    const step = (name: WipeStep['name']): WipeStep => ({
      name,
      run: () => {
        order.push(name);
      },
    });
    await runWipe([step('serviceWorker'), step('caches'), step('database')]);
    expect(order).toEqual(['serviceWorker', 'caches', 'database']);
  });

  it('keeps going after a failure and reports every step that failed', async () => {
    const ran: string[] = [];
    const steps: WipeStep[] = [
      {
        name: 'database',
        run: () => {
          throw new Error('blocked');
        },
      },
      { name: 'files', run: () => void ran.push('files') },
      {
        name: 'caches',
        run: () => Promise.reject(new Error('denied')),
      },
      { name: 'localStorage', run: () => void ran.push('localStorage') },
    ];
    const error = await runWipe(steps).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WipeError);
    expect((error as WipeError).failed).toEqual(['database', 'caches']);
    expect(ran).toEqual(['files', 'localStorage']);
  });
});
