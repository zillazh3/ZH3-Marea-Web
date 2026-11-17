import { describe, expect, it, vi } from 'vitest';
import {
  registerServiceWorker,
  type SwContainerLike,
  type SwRegistrationLike,
  type SwWorkerLike,
} from '@/features/pwa/swClient';
import { buildPrecacheList, precacheVersion, renderServiceWorker } from '../../tools/pwaPlugin';

describe('PWA precache manifest and service worker lifecycle (T9.3)', () => {
  it('includes shell, fonts, JS and CSS in precache while excluding CanvasKit WASM', () => {
    const list = buildPrecacheList([
      'index.html',
      'assets/index-abc123.js',
      'assets/index-def456.css',
      'assets/InterTight-Bold-123.ttf',
      'assets/canvaskit-xyz999.wasm',
      'assets/export.worker-777.js.map',
      'sw.js',
    ]);

    expect(list).toContain('/');
    expect(list).toContain('/manifest.webmanifest');
    expect(list).toContain('/assets/index-abc123.js');
    expect(list).toContain('/assets/InterTight-Bold-123.ttf');
    expect(list.some((u) => u.endsWith('.wasm'))).toBe(false);
    expect(list.some((u) => u.endsWith('.map'))).toBe(false);
    expect(list).not.toContain('/sw.js');

    const v1 = precacheVersion(list);
    const sw = renderServiceWorker(v1, list);
    expect(sw).toContain(`zh3marea-${v1}`);
    expect(sw).toContain("event.data.type === 'SKIP_WAITING'");
    expect(sw).toContain('url.origin !== self.location.origin');
  });

  it('notifies on waiting worker update and triggers reload on controllerchange', async () => {
    const containerListeners = new Map<string, () => void>();
    const regListeners = new Map<string, () => void>();
    const workerListeners = new Map<string, () => void>();
    const posted: unknown[] = [];

    const waitingWorker: SwWorkerLike = {
      state: 'installed',
      postMessage: (msg) => {
        posted.push(msg);
      },
      addEventListener: (t, fn) => {
        workerListeners.set(t, fn);
      },
    };
    const reg: SwRegistrationLike = {
      waiting: waitingWorker,
      installing: null,
      addEventListener: (t, fn) => {
        regListeners.set(t, fn);
      },
    };
    const container: SwContainerLike = {
      controller: {},
      register: vi.fn().mockResolvedValue(reg),
      addEventListener: (t, fn) => {
        containerListeners.set(t, fn);
      },
    };

    const onReload = vi.fn();
    const holder: { apply: (() => void) | null } = { apply: null };
    await registerServiceWorker(container, {
      onUpdateReady: (applyUpdate) => {
        holder.apply = applyUpdate;
      },
      onReload,
    });

    expect(holder.apply).not.toBeNull();
    containerListeners.get('controllerchange')?.();
    expect(onReload).not.toHaveBeenCalled();

    holder.apply?.();
    expect(posted).toEqual([{ type: 'SKIP_WAITING' }]);
    containerListeners.get('controllerchange')?.();
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
