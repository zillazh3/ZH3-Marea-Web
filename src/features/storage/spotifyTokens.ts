import { parseStoredToken, type SpotifyToken } from '@/features/providers/spotify';
import { secrets, type SecretStore } from './secrets';

/**
 * Spotify tokens on disk: only the refresh token. The access token lives in memory and is requested again from the refresh
 * token when the app opens (docs/privacy-and-storage.md).
 */
export function createSpotifyTokenStore(store: SecretStore): {
  load(): Promise<SpotifyToken | null>;
  save(token: SpotifyToken | null): Promise<void>;
} {
  return {
    /** The token has no access part and is already expired, so the first API call refreshes it. */
    async load() {
      const stored = await store.get('spotifyRefreshToken');
      const legacy = await store.get('spotifyToken');
      let refreshToken = stored;
      if (legacy) {
        // An older version also kept the access token on disk: keep its refresh token, then drop that record.
        if (!refreshToken) {
          refreshToken = parseStoredToken(legacy)?.refreshToken ?? '';
          if (refreshToken) await store.set('spotifyRefreshToken', refreshToken);
        }
        await store.set('spotifyToken', '');
      }
      return refreshToken ? { accessToken: '', refreshToken, expiresAtMs: 0 } : null;
    },

    /** `null` removes every stored Spotify token. */
    async save(token) {
      await store.set('spotifyRefreshToken', token?.refreshToken ?? '');
      await store.set('spotifyToken', '');
    },
  };
}

export const spotifyTokenStore = createSpotifyTokenStore(secrets);
