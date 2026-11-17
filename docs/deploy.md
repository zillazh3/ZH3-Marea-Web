# Deploy

ZH3 Marea is a 100% static site on **Cloudflare Workers with static assets**: `wrangler.jsonc` points at `./dist`, there is no
Worker script (`main`) and no SPA fallback. Headers come from `public/_headers`, copied to `dist/` by the build.

Requirements: Node 22.12 or newer (`engines` in `package.json`), `npm ci`.

## The site address: `VITE_SITE_URL`

Canonical links, `hreflang`, Open Graph, `robots.txt` and `sitemap.xml` are generated at build time from `VITE_SITE_URL`. Without
it they use the placeholder `https://zh3marea.workers.dev` and the build prints a warning. Set it to the real address:

- On your PC: a file `.env.production` in the repo root (git-ignored):

  ```
  VITE_SITE_URL=https://zh3marea.<subdomain>.workers.dev
  ```

- In Workers Builds: a build variable with the same name (see below).

Optional, same way: `VITE_SOURCE_URL` (the "Código fuente" link; default `https://github.com/zillazh3/ZH3-Marea-Web`) and
`VITE_WINDOWS_RELEASE_URL` (the Windows download; default the latest release of the desktop repo, `zillazh3/ZH3-Marea`).

## 1. First deploy from your PC

1. Sign in to Cloudflare: `npx wrangler login` (a browser window opens).
2. Choose the `workers.dev` subdomain. If you have none, the first `wrangler deploy` asks you to register one (or use dashboard →
   Workers & Pages → "Your subdomain"). It is the middle part of the address: `zh3marea.<subdomain>.workers.dev`.
3. Create `.env.production` with that address (previous section). If you only learn the subdomain during step 4, deploy once,
   write `.env.production`, and deploy again.
4. `npm run deploy`. It runs `npm run check`, builds, and runs `wrangler deploy`. Nothing is pushed anywhere else.
5. Open `https://zh3marea.<subdomain>.workers.dev/`. A new `workers.dev` address can answer 523 for about a minute.
6. Check it: `npm run smoke -- https://zh3marea.<subdomain>.workers.dev` (pages, `/app` redirect, 404 page, security headers).

To try the production build locally, with the real `_headers`: `npm run preview:static` serves it at `http://127.0.0.1:8787/`.

## 2. Spotify Redirect URIs

In the [Spotify dashboard](https://developer.spotify.com/dashboard) open your app → Settings → Redirect URIs and add each address
exactly (trailing slash included; Spotify rejects `localhost`, use the loopback IP):

| Where                         | Redirect URI                                    |
| ----------------------------- | ----------------------------------------------- |
| Production                    | `https://zh3marea.<subdomain>.workers.dev/app/` |
| Local dev (`npm run dev`)     | `http://127.0.0.1:5173/app/`                    |
| Local static (`preview:static`) | `http://127.0.0.1:8787/app/`                  |

Ajustes → Spotify shows the live Redirect URI of the page you are on, with a copy button.

## 3. Auto-deploy with Workers Builds

Dashboard → Workers & Pages → `zh3marea` → Settings → Builds → Connect to GitHub, then:

| Setting                  | Value                                                                    |
| ------------------------ | ------------------------------------------------------------------------ |
| Git repository           | `zillazh3/ZH3-Marea-Web`                                                 |
| Production branch        | `main`                                                                   |
| Build command            | `npm run build`                                                          |
| Deploy command           | `npx wrangler deploy`                                                    |
| Build variables          | `VITE_SITE_URL` (and `VITE_SOURCE_URL` if the repo moves)                |
| Preview branches         | Settings → Builds → "Builds for Preview branches" on; Preview command: default `npx wrangler preview`, or `npx wrangler versions upload` for a version URL |

Every push to `main` builds and goes live. Other branches never touch production. The build image's default Node (24) satisfies
`engines`; to pin another, add `NODE_VERSION` as a build variable. The checks (`npm run check`, tests, Playwright, Lighthouse) run
in GitHub Actions (`.github/workflows/ci.yml`), not in Workers Builds.

## 4. Roll back

Dashboard → Workers & Pages → `zh3marea` → Deployments → the `⋯` of the version you want → **Rollback**. It becomes the active
deployment at once. From a terminal: `npx wrangler rollback` (previous version) or `npx wrangler rollback <VERSION_ID>`.
A rollback changes only the site files; browsers get the old version through the service worker's normal update.

## 5. Add a custom domain later

No code changes. The domain must be a zone in your Cloudflare account.

1. Dashboard → Workers & Pages → `zh3marea` → Settings → Domains & Routes → Add → **Custom domain**, and enter e.g.
   `marea.example.com`. Cloudflare creates the DNS record and certificate.
2. Set `VITE_SITE_URL=https://marea.example.com` (`.env.production` and the Workers Builds variable) and deploy again, so
   canonical links and the sitemap use it.
3. Add `https://marea.example.com/app/` to the Spotify Redirect URIs.

The old `workers.dev` address keeps working unless you turn it off in the same Settings page.

## Headers and the 404 page

- `public/_headers`: one strict policy for the landing, the privacy pages and the 404 (`/*`), one for the app (`/app/*`, and
  `/assets/*` for the workers). Cloudflare adds the rules together, so the app rules first detach the general policy with
  `! Content-Security-Policy`. Limits: 100 rules, one `*` per pattern. Reasons per directive: `docs/decisions/0007-hosting.md`.
- `assets.not_found_handling: "404-page"` serves `dist/404.html` with status 404 for any unknown path.
- Every change to `_headers` must pass `npm run test:e2e:static`, which serves the production build through `wrangler dev`.
