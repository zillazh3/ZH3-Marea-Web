import { exportQueue } from '@/ui/state/exportQueue.svelte';
import { player } from '@/ui/state/player.svelte';
import { spotifyStatus } from '@/ui/state/spotify.svelte';

// Dev-only fixture (`?seed`) so the shell can be inspected and screenshotted with a populated player and export queue.
spotifyStatus.setConnected(true);
player.load(
  { title: 'Marea alta', artist: 'Los Cuervos', tone: 2 },
  { playing: true, progress: 0.38 },
);
exportQueue.replace([
  {
    id: 'seed-1',
    title: 'Marea alta',
    artist: 'Los Cuervos',
    state: { kind: 'rendering', progress: 0.42, etaSeconds: 38 },
  },
  { id: 'seed-2', title: 'Faro', artist: 'Dúo Sal', state: { kind: 'queued' } },
]);
