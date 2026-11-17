import { mount } from 'svelte';
import { registerServiceWorker } from '@/features/pwa/swClient';
import App from '@/ui/App.svelte';
import { i18n } from '@/ui/i18n.svelte';
import { exportQueue } from '@/ui/state/exportQueue.svelte';
import { library } from '@/ui/state/library.svelte';
import { spicyKey } from '@/ui/state/spicyKey.svelte';
import { spotifyStatus } from '@/ui/state/spotify.svelte';
import { notifications } from '@/ui/state/toasts.svelte';
import '@/ui/styles/tokens.css';
import '@/ui/styles/base.css';

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app mount point in index.html.');

const isSeeded = import.meta.env.DEV && new URLSearchParams(location.search).has('seed');
if (isSeeded) {
  await import('@/ui/dev/seed');
}

void library.refresh();
void exportQueue.init();
void spicyKey.load();
if (!isSeeded) void spotifyStatus.load();
mount(App, { target });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void registerServiceWorker(navigator.serviceWorker, {
      onUpdateReady: (applyUpdate) => {
        notifications.show(i18n.m.toast.updateAvailable, 'info', {
          persistent: true,
          action: { label: i18n.m.toast.updateAction, onClick: applyUpdate },
        });
      },
    }).catch(() => undefined);
  });
}
