import { appDb } from './db';

/** `spotifyToken` is the legacy record that also held the access token; it is only read to migrate and then deleted. */
export type SecretName = 'spicyKey' | 'spotifyClientId' | 'spotifyRefreshToken' | 'spotifyToken';

export interface SecretStore {
  get(name: SecretName): Promise<string>;
  set(name: SecretName, value: string): Promise<void>;
}

/** Keys of this device, in IndexedDB. Settings says plainly that they are not encrypted. */
export const secrets = {
  async get(name: SecretName): Promise<string> {
    return (await (await appDb()).get('secrets', name)) ?? '';
  },

  async set(name: SecretName, value: string): Promise<void> {
    const db = await appDb();
    if (value === '') await db.delete('secrets', name);
    else await db.put('secrets', value, name);
  },
};
