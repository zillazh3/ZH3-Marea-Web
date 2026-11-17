# Contributing to ZH3 Marea Web

Thanks for helping. Issues and pull requests are welcome in English or Spanish.

## Setup

You need Node.js 22.12 or newer and npm.

```sh
git clone https://github.com/zillazh3/ZH3-Marea-Web.git
cd ZH3-Marea-Web
npm install
npm run dev
```

On Windows, Git may convert line endings on checkout (`core.autocrlf=true`) and `npm run check` then fails on formatting. Clone
with `git clone --config core.autocrlf=false ...` so files keep LF, as the [.editorconfig](.editorconfig) expects.

The app is at `http://127.0.0.1:5173/app/` and the landing page at `http://127.0.0.1:5173/`. The dev server uses `127.0.0.1`
because Spotify does not accept `localhost` redirect URIs. Spotify is optional; see "Spotify" in the [README](README.md).

## Before you open a pull request

Run the full local check. It runs typecheck, lint, format check and the unit tests:

```sh
npm run check
```

If you touched the UI, the editor, the export or the routes, also run the end-to-end tests. The first time, install the browser:

```sh
npx playwright install chromium
npm run test:e2e
```

If you touched `public/_headers`, the CSP or anything about hosting, run the production-build tests too. They build the site,
serve `dist/` with `wrangler dev` and fail on any CSP violation or console error:

```sh
npm run test:e2e:static
```

CI runs all of this, plus Lighthouse, on every push (`.github/workflows/ci.yml`).

## Commits and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat(render): ...`, `fix(app): ...`, `docs: ...`,
  `test(export): ...`, `chore(deploy): ...`.
- Keep commits small and focused, and write the message in the imperative.
- Describe what changed and why in the pull request, and say which checks you ran.

## Code rules

- **TypeScript strict**, including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. ESLint runs `strictTypeChecked` and also rejects non-null assertions (`!`), so fix the type instead of silencing it.
- **Layers.** Imports point inward only: `shared` → `engine` → `render` → `export` → `features` → `ui`. A layer imports only from
  the ones before it. ESLint enforces this; see [ADR 0001](docs/decisions/0001-layered-architecture.md). The engine has no DOM.
- **Colors** live in `src/ui/styles/tokens.css`. A test fails on color literals anywhere else.
- **Svelte 5** with runes. State goes in small `.svelte.ts` modules ([ADR 0002](docs/decisions/0002-ui-stack.md)).
- **Formatting** is Prettier (single quotes, 100 columns, trailing commas). Run `npm run format` to fix it. The
  [.editorconfig](.editorconfig) sets LF line endings and two-space indentation.
- Split files that grow past about 300 lines by responsibility.
- **Language.** Code, comments, docs and commit messages are in English. The UI is in Mexican Spanish and English; add every new
  string to both `src/features/i18n/es-MX.ts` and `src/features/i18n/en.ts`.
- Validate data at the boundaries (files, network, storage) with explicit functions, and never trust a shape you did not check.
- Add a dependency only when it is needed, and say why in the pull request.

## Parity with the desktop app

The animation engine is checked against values recorded from the desktop app (`tests/fixtures/engine/`). The fixtures are
committed, so tests don't need Python. After an intentional engine change, regenerate them with the desktop app's own
interpreter (it writes nothing in the desktop tree) and review the diff like code:

```sh
<desktop>/.venv/Scripts/python.exe -B tools/export-fixtures.py --desktop <desktop>
```

`--desktop` can be replaced by the `MAREA_DESKTOP` environment variable. The same run also writes the lyrics parser, provider and
`.marea.json` fixtures (`tests/fixtures/lyrics/`, `tests/fixtures/project/`).

To check the other direction, that the desktop app opens a project made by the web app, run:

```sh
<desktop>/.venv/Scripts/python.exe -B tools/verify-desktop-load.py --desktop <desktop> <file.marea.json>
```

## Docs

Decisions go in [docs/decisions/](docs/decisions/) as short numbered ADRs. If you change what the app stores or where it sends
data, update [docs/privacy-and-storage.md](docs/privacy-and-storage.md) and both privacy pages together.

## License

By contributing you agree that your work is released under the [GNU AGPL-3.0](LICENSE), like the rest of the project.
