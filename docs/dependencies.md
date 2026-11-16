# Dependencies

Every runtime dependency needs a one-line reason here. Versions are those current on 2026-11-16; exact pins are set in M2.

## Runtime

| Package | Reason |
|---|---|
| `svelte` | Component framework with a small compiled runtime for the six screens and the shell (ADR 0002). |
| `canvaskit-wasm` | Skia in WASM for layout and drawing parity with the desktop renderer (ADR 0003). Pending the M2b spike. |
| `mediabunny` | Maintained MP4 muxer/demuxer and WebCodecs helpers; `mp4-muxer` is deprecated in its favor (ADR 0004). |
| `idb` | Typed promise wrapper over IndexedDB, about 1 KB (ADR 0006). |
| `yaml` | Parses LRCLIB's Lyricsfile word-sync format; loaded as a lazy chunk only when needed. |

Not added on purpose: a router (about 50 lines of our own), i18n library (ADR 0009), service worker toolkit (ADR 0008), CSS framework,
state library, date library.

## Development

| Package | Reason |
|---|---|
| `vite`, `@sveltejs/vite-plugin-svelte` | Build and dev server. |
| `typescript`, `svelte-check` | Strict type checking of `.ts` and `.svelte`. |
| `eslint`, `typescript-eslint`, `eslint-plugin-svelte` | Lint with strict-type-checked rules and layer import restrictions. |
| `prettier`, `prettier-plugin-svelte` | Formatting. |
| `vitest` | Unit and parity tests (Node, no DOM for engine code). |
| `@playwright/test` | E2E, visual baselines, export determinism check. |
| `wrangler` | Deploy to Cloudflare Workers static assets. |

## Outside npm

| Tool | Reason |
|---|---|
| Python 3.12 + the desktop `.venv` | Only to regenerate parity fixtures (`tools/export-fixtures.py`); never needed by CI. |
