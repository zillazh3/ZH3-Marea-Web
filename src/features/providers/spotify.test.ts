import { describe, expect, it } from 'vitest';
import type { ProviderError } from './errors';
import { SPOTIFY_SCOPES, SpotifyClient, pkceChallenge, type SpotifyToken } from './spotify';

function makeJsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('SpotifyClient PKCE and Web API', () => {
  it('computes RFC 7636 S256 PKCE code challenge', async () => {
    // RFC 7636 Appendix B test vector:
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = await pkceChallenge(verifier);
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('builds auth URL, checks state on callback, and exchanges code for tokens', async () => {
    const state: { saved: SpotifyToken | null } = { saved: null };
    const calls: { url: string; body: string }[] = [];
    const client = new SpotifyClient({
      clientId: () => 'my-client-id',
      loadToken: () => Promise.resolve(state.saved),
      saveToken: (tok) => {
        state.saved = tok;
        return Promise.resolve();
      },
      now: () => 1_000_000,
      fetchImpl: (input, init) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        const body = init?.body instanceof URLSearchParams ? init.body.toString() : '';
        calls.push({ url, body });
        return Promise.resolve(
          makeJsonResponse({
            access_token: 'acc-1',
            refresh_token: 'ref-1',
            expires_in: 3600,
          }),
        );
      },
    });

    const { url, pending } = await client.buildAuthorizationUrl('http://127.0.0.1:5173/callback');
    const parsed = new URL(url);
    expect(parsed.searchParams.get('client_id')).toBe('my-client-id');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    expect(parsed.searchParams.get('scope')).toBe(SPOTIFY_SCOPES);

    await expect(client.exchangeCode(`?code=abc&state=wrong`, pending)).rejects.toMatchObject({
      code: 'spotifyStateMismatch',
    });

    await expect(
      client.exchangeCode(`?error=access_denied&state=${pending.state}`, pending),
    ).rejects.toMatchObject({ code: 'spotifyDenied' });

    const tok = await client.exchangeCode(`?code=auth-code-123&state=${pending.state}`, pending);
    expect(tok.accessToken).toBe('acc-1');
    expect(tok.refreshToken).toBe('ref-1');
    expect(client.connected).toBe(true);
    expect(state.saved?.refreshToken).toBe('ref-1');
    expect(calls[0]?.body).toContain('grant_type=authorization_code');
    expect(calls[0]?.body).toContain('code=auth-code-123');
  });

  it('refreshes expired token, retries once on 401, handles 204/429 and searches tracks', async () => {
    const clockMs = 1_000_000;
    let stored: SpotifyToken | null = {
      accessToken: 'old-access',
      refreshToken: 'ref-1',
      expiresAtMs: clockMs + 30_000, // within 60s margin -> proactive refresh
    };
    let apiStep = 0;

    const client = new SpotifyClient({
      clientId: () => 'cid',
      loadToken: () => Promise.resolve(stored),
      saveToken: (tok) => {
        stored = tok;
        return Promise.resolve();
      },
      now: () => clockMs,
      fetchImpl: (input, init) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.endsWith('/api/token')) {
          return Promise.resolve(
            makeJsonResponse({ access_token: 'fresh-access', expires_in: 3600 }),
          );
        }
        apiStep += 1;
        if (apiStep === 1) {
          // Verify proactive refresh sent fresh-access
          const auth = new Headers(init?.headers).get('Authorization');
          expect(auth).toBe('Bearer fresh-access');
          return Promise.resolve(
            makeJsonResponse({
              tracks: {
                items: [
                  {
                    id: 'sp123',
                    name: 'Marea',
                    artists: [{ name: 'Zilla' }],
                    album: {
                      name: 'Noche',
                      images: [
                        { url: 'https://i.scdn.co/small', width: 64 },
                        { url: 'https://i.scdn.co/big', width: 640 },
                      ],
                    },
                    duration_ms: 205_000,
                    uri: 'spotify:track:sp123',
                  },
                ],
              },
            }),
          );
        }
        if (apiStep === 2) {
          // Return 401 -> triggers single refresh retry
          return Promise.resolve(makeJsonResponse({ error: { status: 401 } }, 401));
        }
        if (apiStep === 3) {
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        return Promise.resolve(makeJsonResponse({}, 429, { 'Retry-After': '12' }));
      },
    });

    expect(await client.init()).toBe(true);
    const tracks = await client.search('marea');
    expect(tracks).toHaveLength(1);
    expect(tracks[0]?.coverUrl).toBe('https://i.scdn.co/big');
    expect(tracks[0]?.artist).toBe('Zilla');

    expect(await client.nowPlaying()).toBeNull();

    await expect(client.nowPlaying()).rejects.toMatchObject({
      name: 'ProviderError',
      code: 'wait',
      seconds: 12,
    } satisfies Partial<ProviderError>);
  });
});
