import { describe, expect, it } from 'vitest';
import type { SecretName, SecretStore } from './secrets';
import { createSpotifyTokenStore } from './spotifyTokens';

function fakeStore(initial: Partial<Record<SecretName, string>> = {}): SecretStore & {
  readonly data: Map<SecretName, string>;
} {
  const data = new Map(Object.entries(initial) as [SecretName, string][]);
  return {
    data,
    get: (name) => Promise.resolve(data.get(name) ?? ''),
    set: (name, value) => {
      if (value === '') data.delete(name);
      else data.set(name, value);
      return Promise.resolve();
    },
  };
}

const TOKEN = { accessToken: 'access-secret', refreshToken: 'refresh-1', expiresAtMs: 5_000 };

describe('spotify token store', () => {
  it('persists the refresh token only, never the access token', async () => {
    const store = fakeStore();
    await createSpotifyTokenStore(store).save(TOKEN);
    expect([...store.data.entries()]).toEqual([['spotifyRefreshToken', 'refresh-1']]);
  });

  it('loads an expired in-memory token built from the refresh token', async () => {
    const store = fakeStore({ spotifyRefreshToken: 'refresh-1' });
    await expect(createSpotifyTokenStore(store).load()).resolves.toEqual({
      accessToken: '',
      refreshToken: 'refresh-1',
      expiresAtMs: 0,
    });
  });

  it('loads nothing when Spotify was never connected', async () => {
    await expect(createSpotifyTokenStore(fakeStore()).load()).resolves.toBeNull();
  });

  it('migrates the legacy record: keeps its refresh token and deletes the stored access token', async () => {
    const store = fakeStore({ spotifyToken: JSON.stringify(TOKEN) });
    const loaded = await createSpotifyTokenStore(store).load();
    expect(loaded?.refreshToken).toBe('refresh-1');
    expect(store.data.get('spotifyRefreshToken')).toBe('refresh-1');
    expect(store.data.has('spotifyToken')).toBe(false);
    expect(JSON.stringify([...store.data])).not.toContain('access-secret');
  });

  it('drops an unreadable legacy record without connecting', async () => {
    const store = fakeStore({ spotifyToken: 'not json' });
    await expect(createSpotifyTokenStore(store).load()).resolves.toBeNull();
    expect(store.data.size).toBe(0);
  });

  it('removes every Spotify token on disconnect but keeps the Client ID', async () => {
    const store = fakeStore({
      spotifyRefreshToken: 'refresh-1',
      spotifyToken: JSON.stringify(TOKEN),
      spotifyClientId: 'my-client-id',
    });
    await createSpotifyTokenStore(store).save(null);
    expect([...store.data.entries()]).toEqual([['spotifyClientId', 'my-client-id']]);
  });
});
