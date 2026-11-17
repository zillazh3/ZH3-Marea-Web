import { asArray, asNumber, asString, isRecord, parseJson } from '@/shared/json';
import { ProviderError } from './errors';

const SERVICE = 'Spotify';
export const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
export const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
export const SPOTIFY_API_URL = 'https://api.spotify.com/v1';
export const SPOTIFY_SCOPES = 'user-read-currently-playing user-read-playback-state';
export const SPOTIFY_CALLBACK_PATH = '/callback';
export const SPOTIFY_SEARCH_LIMIT = 10;
const EXPIRY_MARGIN_MS = 60_000;
const DEFAULT_WAIT_S = 10;

export interface SpotifyTrack {
  readonly id: string;
  readonly title: string;
  readonly artists: readonly string[];
  readonly artist: string;
  readonly album: string;
  readonly durationMs: number;
  readonly coverUrl: string | null;
  readonly uri: string;
}

export interface SpotifyPlayback {
  readonly track: SpotifyTrack;
  readonly progressMs: number;
  readonly isPlaying: boolean;
  readonly timestampMs: number;
}

export interface SpotifyToken {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAtMs: number;
}

export interface PendingPkce {
  readonly verifier: string;
  readonly state: string;
  readonly redirectUri: string;
  readonly returnRoute: string;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function pkceChallenge(
  verifier: string,
  cryptoObj: Crypto = globalThis.crypto,
): Promise<string> {
  const encoded = new TextEncoder().encode(verifier);
  const digest = await cryptoObj.subtle.digest('SHA-256', encoded);
  return base64UrlEncode(new Uint8Array(digest));
}

export async function generatePkcePair(
  cryptoObj: Crypto = globalThis.crypto,
): Promise<{ verifier: string; challenge: string }> {
  const bytes = new Uint8Array(64);
  cryptoObj.getRandomValues(bytes);
  const verifier = base64UrlEncode(bytes);
  const challenge = await pkceChallenge(verifier, cryptoObj);
  return { verifier, challenge };
}

export function createOAuthState(cryptoObj: Crypto = globalThis.crypto): string {
  const bytes = new Uint8Array(16);
  cryptoObj.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export function parseSpotifyTrack(item: unknown): SpotifyTrack | null {
  if (!isRecord(item)) return null;
  const id = asString(item.id);
  const title = asString(item.name);
  if (!id || !title) return null;
  const artists: string[] = [];
  for (const rawArtist of asArray(item.artists)) {
    if (isRecord(rawArtist)) {
      const name = asString(rawArtist.name);
      if (name) artists.push(name);
    }
  }
  const albumObj = isRecord(item.album) ? item.album : {};
  const album = asString(albumObj.name);
  const images = asArray(albumObj.images)
    .filter(isRecord)
    .map((img) => ({ url: asString(img.url), width: asNumber(img.width) }))
    .filter((img) => img.url.length > 0)
    .sort((a, b) => b.width - a.width);
  const durationMs = asNumber(item.duration_ms);
  return {
    id,
    title,
    artists,
    artist: artists.join(', '),
    album,
    durationMs: Math.max(0, Math.round(durationMs)),
    coverUrl: images[0]?.url ?? null,
    uri: asString(item.uri),
  };
}

export function parseStoredToken(raw: string): SpotifyToken | null {
  if (!raw.trim()) return null;
  try {
    const parsed = parseJson(raw);
    if (!isRecord(parsed)) return null;
    const accessToken = asString(parsed.accessToken);
    const refreshToken = asString(parsed.refreshToken);
    const expiresAtMs = asNumber(parsed.expiresAtMs, -1);
    if (!accessToken || !refreshToken || expiresAtMs < 0) return null;
    return { accessToken, refreshToken, expiresAtMs };
  } catch {
    return null;
  }
}

export interface SpotifyClientOptions {
  readonly clientId: () => string;
  readonly loadToken: () => Promise<SpotifyToken | null>;
  readonly saveToken: (token: SpotifyToken | null) => Promise<void>;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
  readonly cryptoObj?: Crypto;
}

export class SpotifyClient {
  private readonly clientIdFn: () => string;
  private readonly loadToken: () => Promise<SpotifyToken | null>;
  private readonly saveToken: (token: SpotifyToken | null) => Promise<void>;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly cryptoObj: Crypto;
  private token: SpotifyToken | null = null;
  private refreshing: Promise<string> | null = null;

  constructor(opts: SpotifyClientOptions) {
    this.clientIdFn = opts.clientId;
    this.loadToken = opts.loadToken;
    this.saveToken = opts.saveToken;
    this.fetchImpl = opts.fetchImpl ?? ((...args) => globalThis.fetch(...args));
    this.now = opts.now ?? (() => Date.now());
    this.cryptoObj = opts.cryptoObj ?? globalThis.crypto;
  }

  get connected(): boolean {
    return this.token !== null && this.token.refreshToken.length > 0;
  }

  async init(): Promise<boolean> {
    this.token = await this.loadToken();
    return this.connected;
  }

  private requireClientId(): string {
    const cid = this.clientIdFn().trim();
    if (!cid) throw new ProviderError('spotifyClientMissing', SERVICE);
    return cid;
  }

  async buildAuthorizationUrl(
    redirectUri: string,
    returnRoute = 'settings',
  ): Promise<{ url: string; pending: PendingPkce }> {
    const clientId = this.requireClientId();
    const { verifier, challenge } = await generatePkcePair(this.cryptoObj);
    const state = createOAuthState(this.cryptoObj);
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: SPOTIFY_SCOPES,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state,
    });
    return {
      url: `${SPOTIFY_AUTH_URL}?${params.toString()}`,
      pending: { verifier, state, redirectUri, returnRoute },
    };
  }

  async exchangeCode(search: string, pending: PendingPkce | null): Promise<SpotifyToken> {
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    const state = params.get('state');
    const err = params.get('error');
    const code = params.get('code');
    if (!pending || !state || state !== pending.state) {
      throw new ProviderError('spotifyStateMismatch', SERVICE);
    }
    if (err || !code) {
      throw new ProviderError('spotifyDenied', SERVICE);
    }
    return this.grant({
      grant_type: 'authorization_code',
      code,
      redirect_uri: pending.redirectUri,
      code_verifier: pending.verifier,
    });
  }

  async disconnect(): Promise<void> {
    this.token = null;
    this.refreshing = null;
    await this.saveToken(null);
  }

  private async grant(form: Record<string, string>): Promise<SpotifyToken> {
    const clientId = this.requireClientId();
    const body = new URLSearchParams({ ...form, client_id: clientId });
    let response: Response;
    try {
      response = await this.fetchImpl(SPOTIFY_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
    } catch {
      throw new ProviderError('noResponse', SERVICE);
    }

    let rawJson: unknown;
    try {
      rawJson = await response.json();
    } catch {
      rawJson = null;
    }

    if (response.status !== 200) {
      const errCode = isRecord(rawJson) ? asString(rawJson.error) : '';
      if (errCode === 'invalid_client') {
        throw new ProviderError('spotifyInvalidClient', SERVICE);
      }
      throw new ProviderError('spotifyRejected', SERVICE);
    }

    if (!isRecord(rawJson)) throw new ProviderError('spotifyRejected', SERVICE);
    const accessToken = asString(rawJson.access_token);
    if (!accessToken) throw new ProviderError('spotifyRejected', SERVICE);
    const refreshToken = asString(rawJson.refresh_token) || (this.token?.refreshToken ?? '');
    if (!refreshToken) throw new ProviderError('spotifyRejected', SERVICE);
    const expiresInS = asNumber(rawJson.expires_in, 3600);
    const next: SpotifyToken = {
      accessToken,
      refreshToken,
      expiresAtMs: this.now() + expiresInS * 1000,
    };
    this.token = next;
    await this.saveToken(next);
    return next;
  }

  private async refreshAccessToken(): Promise<string> {
    if (!this.token?.refreshToken) {
      throw new ProviderError('spotifyNotConnected', SERVICE);
    }
    if (!this.refreshing) {
      const refreshToken = this.token.refreshToken;
      this.refreshing = this.grant({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      })
        .then((tok) => tok.accessToken)
        .finally(() => {
          this.refreshing = null;
        });
    }
    return this.refreshing;
  }

  private async getAccessToken(): Promise<string> {
    if (!this.token?.refreshToken) {
      throw new ProviderError('spotifyNotConnected', SERVICE);
    }
    if (this.now() >= this.token.expiresAtMs - EXPIRY_MARGIN_MS) {
      return this.refreshAccessToken();
    }
    return this.token.accessToken;
  }

  private async request(path: string, query?: Record<string, string>): Promise<Response> {
    const url = query
      ? `${SPOTIFY_API_URL}${path}?${new URLSearchParams(query).toString()}`
      : `${SPOTIFY_API_URL}${path}`;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const accessToken =
        attempt === 1 ? await this.getAccessToken() : await this.refreshAccessToken();
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      } catch {
        throw new ProviderError('noResponse', SERVICE);
      }

      if (response.status === 401 && attempt === 1) continue;
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('Retry-After'));
        const seconds =
          Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : DEFAULT_WAIT_S;
        throw new ProviderError('wait', SERVICE, seconds);
      }
      if (response.status === 401 || response.status === 403) {
        throw new ProviderError('spotifyRejected', SERVICE);
      }
      if (response.status >= 500) {
        throw new ProviderError('busy', SERVICE);
      }
      if (response.status >= 400 && response.status !== 404) {
        throw new ProviderError('spotifyRejected', SERVICE);
      }
      return response;
    }
    throw new ProviderError('spotifyRejected', SERVICE);
  }

  async search(query: string, limit = SPOTIFY_SEARCH_LIMIT): Promise<SpotifyTrack[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const response = await this.request('/search', {
      q: trimmed,
      type: 'track',
      limit: String(limit),
    });
    const data: unknown = await response.json().catch(() => ({}));
    if (!isRecord(data) || !isRecord(data.tracks)) return [];
    const out: SpotifyTrack[] = [];
    for (const rawItem of asArray(data.tracks.items)) {
      const track = parseSpotifyTrack(rawItem);
      if (track) out.push(track);
    }
    return out;
  }

  async nowPlaying(): Promise<SpotifyPlayback | null> {
    const response = await this.request('/me/player/currently-playing');
    if (response.status === 204 || response.status === 404) return null;
    const text = await response.text();
    if (!text.trim()) return null;
    const data: unknown = parseJson(text);
    if (!isRecord(data)) return null;
    const item = data.item;
    if (!isRecord(item) || asString(item.type) !== 'track') return null;
    const track = parseSpotifyTrack(item);
    if (!track) return null;
    return {
      track,
      progressMs: asNumber(data.progress_ms),
      isPlaying: data.is_playing === true,
      timestampMs: asNumber(data.timestamp),
    };
  }

  async fetchCoverBytes(url: string): Promise<Uint8Array> {
    let response: Response;
    try {
      response = await this.fetchImpl(url);
    } catch {
      throw new ProviderError('spotifyCoverFailed', SERVICE);
    }
    if (!response.ok) throw new ProviderError('spotifyCoverFailed', SERVICE);
    return new Uint8Array(await response.arrayBuffer());
  }
}
