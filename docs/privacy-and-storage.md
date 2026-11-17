# Privacy and storage

ZH3 Marea has no backend and no accounts. Everything the app remembers lives in the browser, for this origin only. This
file is the engineering reference behind the public pages `/privacidad/` and `/en/privacy/`: change both together.

## What is stored, and where

| Store                         | Key / name                                    | Content                                                                    | Removed by                         |
| ----------------------------- | --------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------- |
| IndexedDB `zh3marea`          | `projects`, `projectFiles`                    | Library list and each project's `.marea.json` body                         | Delete a project; wipe             |
| IndexedDB `zh3marea`          | `presets`, `presetThumbs`                     | User Corrientes presets and their thumbnails                               | Delete a preset; wipe              |
| IndexedDB `zh3marea`          | `exportHistory`                               | Export metadata and PNG thumbnails (cap: 50 entries)                       | Delete an export; wipe             |
| IndexedDB `zh3marea`          | `lyricsCache`                                 | LRCLIB and Spicy Lyrics responses (found: 7 to 30 days, missing: 1 day)    | Wipe                               |
| IndexedDB `zh3marea`          | `secrets/spicyKey`                            | Spicy Lyrics API key (not encrypted)                                       | Clear the field in Ajustes; wipe   |
| IndexedDB `zh3marea`          | `secrets/spotifyClientId`                     | The user's own Spotify Client ID (a public app id, not a credential)       | Wipe                               |
| IndexedDB `zh3marea`          | `secrets/spotifyRefreshToken`                 | Spotify refresh token (see below)                                          | "Desconectar Spotify"; wipe        |
| OPFS                          | `audio/<projectId>`, `exports/<name>`         | Imported audio files and exported MP4s                                     | Delete a project or export; wipe   |
| localStorage                  | `zh3marea.preferences`                        | Theme, language, menu, experimental flags                                  | Wipe                               |
| localStorage                  | `zh3marea.exportPrefs`                        | Export panel defaults                                                      | Wipe                               |
| localStorage                  | `zh3marea.backup`                             | Which projects were exported, and when the backup reminder was last shown  | Wipe                               |
| sessionStorage                | `zh3marea.spotify.pkce`                       | PKCE verifier and state while the Spotify login is open                    | Callback; "Desconectar"; wipe      |
| Cache Storage + service worker | `zh3marea-<hash>`, registration on `/app/`    | Offline copy of the app code (no user data)                                | Wipe (the app registers it again)  |

"Wipe" is Ajustes → "Borrar todos mis datos" (`src/features/storage/wipe.ts`): it unregisters the service worker, deletes
the caches and the IndexedDB database, empties OPFS, clears `localStorage` and `sessionStorage`, then reloads `/app/`.
Clearing the site's data from the browser settings has the same effect.

The `.marea.json` backup ("Descargar .marea.json" in Biblioteca) holds lyrics, style and cover. It stores only the audio
file's name, not the audio: the audio stays in OPFS.

## Spotify tokens

The app uses the Authorization Code flow with PKCE and the user's own Client ID. Scopes: `user-read-currently-playing`,
`user-read-playback-state`. There is no client secret anywhere.

| Item                    | Lives in                                   | For how long                                                   |
| ----------------------- | ------------------------------------------ | -------------------------------------------------------------- |
| PKCE verifier and state | `sessionStorage` `zh3marea.spotify.pkce`   | From "Conectar" until the callback (removed on return); per tab |
| Authorization code      | The URL of the callback only               | Exchanged at once; the address bar is cleaned                  |
| Access token            | **Memory only** (`SpotifyClient`)          | About one hour; gone on reload or when the tab closes          |
| Refresh token           | IndexedDB `secrets/spotifyRefreshToken`    | Until "Desconectar Spotify" or a wipe                          |
| Client ID               | IndexedDB `secrets/spotifyClientId`        | Until the user clears it or wipes; kept on disconnect          |

On open, `spotifyTokenStore.load()` builds an expired in-memory token from the refresh token, so the first Spotify call asks
for a fresh access token. Older versions stored the access token as well (`secrets/spotifyToken`); that record is migrated
(its refresh token is kept) and deleted the first time the app loads.

Tokens are not encrypted: a key stored next to its own secret would be false assurance. The defences are the origin boundary
and the Content Security Policy (`script-src 'self'`), so only this site's own scripts can read them.

"Desconectar Spotify" removes `spotifyRefreshToken`, the legacy `spotifyToken` and the PKCE session key, and clears the in-memory
token. It keeps the Client ID so reconnecting does not need pasting it again.

## External requests

Made directly by the browser, never through a server of ours:

| Origin                        | Why                                                  | When                                 |
| ----------------------------- | ---------------------------------------------------- | ------------------------------------ |
| `https://lrclib.net`          | Lyrics search (title, artist, album, duration)       | Whenever the user searches lyrics    |
| `https://api.spicylyrics.org` | Syllable lyrics by Spotify track id, with the key    | Only with a saved Spicy Lyrics key   |
| `https://accounts.spotify.com`| PKCE login and token exchange                        | Only when connecting Spotify         |
| `https://api.spotify.com`     | Track search, currently playing                      | Only when connected                  |
| `https://i.scdn.co`           | Album covers (shown, and fetched into the project)   | Only when connected                  |

The landing and privacy pages contact no third party. The headers that allow these origins are in `public/_headers`.
