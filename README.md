# ZH3 Marea (web)

Syllable-synced, Apple Music-style lyric clips for TikTok, running entirely in your browser. Pick a song, choose a range of verses
and export a 60 fps MP4 (1080x1920, 1080x1080 or 1920x1080). This is the web version of the desktop app ZH3 Marea.

**Privacy:** everything stays on your device. There is no backend and there are no accounts. Projects, settings, audio files and
exports live in your browser's storage. The only network calls go to the lyrics and music services you choose to use
(LRCLIB, Spicy Lyrics, Spotify). Details: `docs/privacy-and-storage.md`, and the public pages `/privacidad/` and `/en/privacy/`.

Status: early development. See `tasks/todo.md` for progress and `docs/decisions/` for the reasoning behind each choice.

## Run

Requires Node 22.12 or newer.

```sh
npm install
npm run dev        # http://127.0.0.1:5173
```

| Command | What it does |
|---|---|
| `npm run check` | typecheck, lint, format check and unit tests |
| `npm run test:e2e` | Playwright end-to-end tests (first time: `npx playwright install chromium`) |
| `npm run test:e2e:static` | builds, serves `dist/` through `wrangler dev` and fails on any CSP violation or console error |
| `npm run build` | production build in `dist/` |
| `npm run preview:static` | builds and serves `dist/` with the real `_headers` at `http://127.0.0.1:8787` |
| `npm run smoke -- <url>` | post-deploy checks: pages, `/app` redirect, 404 page, security headers |
| `npm run format` | format the code with Prettier |

The dev server binds `127.0.0.1` because Spotify does not accept `localhost` redirect URIs.

## Parity fixtures

The engine is checked against values recorded from the desktop app (`tests/fixtures/engine/`). They are committed, so tests need no
Python. To regenerate them after an intentional engine change, run the generator with the desktop app's own interpreter (it opens
nothing for writing in that tree) and review the diff like code:

```sh
<desktop>/.venv/Scripts/python.exe -B tools/export-fixtures.py --desktop <desktop>
```

`--desktop` can be replaced by the `MAREA_DESKTOP` environment variable. The same run also writes the lyrics parser, provider and
`.marea.json` fixtures (`tests/fixtures/lyrics/`, `tests/fixtures/project/`).

To check the other direction, that the desktop opens a project made by the web app, run the desktop interpreter on
`tools/verify-desktop-load.py --desktop <desktop> <file.marea.json>` (writes nothing in the desktop tree).

## Layout

```
src/shared/    pure helpers (Python-compat math, hashes)
src/engine/    animation engine, no DOM
src/render/    draws a frame from engine state
src/export/    worker, encoders, muxer
src/features/  lyrics, projects, presets, hooks, wordfx, storage, i18n
src/ui/        Svelte components, routes, design tokens
```

Imports point inward only (left to right above is the allowed direction of dependency); ESLint enforces it. See
`docs/decisions/0001-layered-architecture.md`.

## Deploy

Cloudflare Workers with static assets on the free `workers.dev` subdomain: no Worker script, no SPA fallback (`wrangler.jsonc`,
`public/_headers`, `docs/decisions/0007-hosting.md`). Nothing in the source depends on a fixed domain.

`npm run deploy` runs the checks, builds and runs `wrangler deploy`; run it only when you mean to publish. Step by step (first
deploy, auto-deploy with Workers Builds, Spotify Redirect URIs, rollback, custom domain, `VITE_SITE_URL`): `docs/deploy.md`.

## License

GNU AGPL-3.0, the same as the desktop app. If you modify it and offer it over a network, publish your changes under the same
license. Credits for ported work and bundled assets are in `THIRD_PARTY.md`.
