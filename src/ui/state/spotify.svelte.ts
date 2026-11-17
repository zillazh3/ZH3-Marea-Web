import {
  SPOTIFY_CALLBACK_PATH,
  SpotifyClient,
  type PendingPkce,
  type SpotifyPlayback,
  type SpotifyTrack,
} from '@/features/providers/spotify';
import { secrets } from '@/features/storage/secrets';
import { spotifyTokenStore } from '@/features/storage/spotifyTokens';
import { isRecord, parseJson } from '@/shared/json';

const PKCE_SESSION_KEY = 'zh3marea.spotify.pkce';
const NOW_PLAYING_POLL_MS = 12_000;

let clientId = $state('');
let connected = $state(false);
let connecting = $state(false);
let nowPlaying = $state.raw<SpotifyPlayback | null>(null);
let nowPlayingLoading = $state(false);
let loaded = $state(false);
let loadPromise: Promise<void> | null = null;

const client = new SpotifyClient({
  clientId: () => clientId,
  loadToken: () => spotifyTokenStore.load(),
  saveToken: (token) => spotifyTokenStore.save(token),
});

function readPendingPkce(): PendingPkce | null {
  try {
    const raw = sessionStorage.getItem(PKCE_SESSION_KEY);
    if (!raw) return null;
    const parsed = parseJson(raw);
    if (!isRecord(parsed)) return null;
    const verifier = typeof parsed.verifier === 'string' ? parsed.verifier : '';
    const state = typeof parsed.state === 'string' ? parsed.state : '';
    const redirectUri = typeof parsed.redirectUri === 'string' ? parsed.redirectUri : '';
    const returnRoute = typeof parsed.returnRoute === 'string' ? parsed.returnRoute : 'settings';
    if (!verifier || !state || !redirectUri) return null;
    return { verifier, state, redirectUri, returnRoute };
  } catch {
    return null;
  }
}

export function spotifyRedirectUri(): string {
  return typeof location !== 'undefined'
    ? `${location.origin}${SPOTIFY_CALLBACK_PATH}`
    : SPOTIFY_CALLBACK_PATH;
}

export const spotifyStatus = {
  get connected(): boolean {
    return connected;
  },
  get connecting(): boolean {
    return connecting;
  },
  get clientId(): string {
    return clientId;
  },
  get nowPlaying(): SpotifyPlayback | null {
    return nowPlaying;
  },
  get nowPlayingLoading(): boolean {
    return nowPlayingLoading;
  },
  get loaded(): boolean {
    return loaded;
  },
  setConnected(value: boolean): void {
    connected = value;
  },
  async load(): Promise<void> {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      try {
        const [cid, hasTok] = await Promise.all([secrets.get('spotifyClientId'), client.init()]);
        clientId = cid;
        if (hasTok) connected = true;
        loaded = true;
        if (hasTok) void this.refreshNowPlaying();
        const poll = (): void => {
          if (connected && document.visibilityState === 'visible') void this.refreshNowPlaying();
        };
        setInterval(poll, NOW_PLAYING_POLL_MS);
        document.addEventListener('visibilitychange', poll);
      } catch {
        loaded = true;
      }
    })();
    return loadPromise;
  },
  async saveClientId(next: string): Promise<boolean> {
    const cleaned = next.trim();
    clientId = cleaned;
    try {
      await secrets.set('spotifyClientId', cleaned);
      return true;
    } catch {
      return false;
    }
  },
  async startConnect(returnRoute = 'settings'): Promise<string> {
    const redirectUri = spotifyRedirectUri();
    const { url, pending } = await client.buildAuthorizationUrl(redirectUri, returnRoute);
    try {
      sessionStorage.setItem(PKCE_SESSION_KEY, JSON.stringify(pending));
    } catch {
      // sessionStorage failure is caught on callback as state mismatch.
    }
    return url;
  },
  async completeCallback(search: string): Promise<string> {
    connecting = true;
    try {
      const pending = readPendingPkce();
      try {
        sessionStorage.removeItem(PKCE_SESSION_KEY);
      } catch {
        // Ignore storage cleanup error.
      }
      if (!loaded) await this.load();
      await client.exchangeCode(search, pending);
      connected = true;
      void this.refreshNowPlaying();
      return pending?.returnRoute ?? 'settings';
    } finally {
      connecting = false;
    }
  },
  async disconnect(): Promise<void> {
    await client.disconnect();
    try {
      sessionStorage.removeItem(PKCE_SESSION_KEY);
    } catch {
      // Blocked storage holds no PKCE state to remove.
    }
    connected = false;
    nowPlaying = null;
  },
  async search(query: string): Promise<SpotifyTrack[]> {
    return client.search(query);
  },
  async refreshNowPlaying(): Promise<void> {
    if (!client.connected) {
      nowPlaying = null;
      return;
    }
    nowPlayingLoading = true;
    try {
      nowPlaying = await client.nowPlaying();
      connected = client.connected;
    } catch {
      // Non-fatal background refresh failure leaves previous metadata intact.
    } finally {
      nowPlayingLoading = false;
    }
  },
  async fetchCoverBytes(url: string): Promise<Uint8Array> {
    return client.fetchCoverBytes(url);
  },
};
