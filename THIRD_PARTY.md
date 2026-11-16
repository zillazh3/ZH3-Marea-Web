# Third-party notices

ZH3 Marea is free software under the **GNU AGPL-3.0** (see `LICENSE`), (c) 2026 Zilla-ZH3. This file lists where the work that is
not original comes from. It carries over the credits of the desktop app.

## Ideas and values ported to the engine (AGPL-3.0)

| Project | What was taken |
|---|---|
| [Apple Music-like Lyrics (AMLL)](https://github.com/amll-dev/applemusic-like-lyrics) | scroll, blur and interlude values |
| [Spicy Lyrics](https://github.com/Spikerko/spicy-lyrics) | syllable progress curves, per-syllable springs and lyrics; also a lyrics source (API) |
| `spr` by Fraktality | analytic spring by frequency and damping ratio |

Because of these, this project is also AGPL-3.0: if you modify it and offer it, even as a network service, publish your code under
the same license and keep these credits.

## Shipped with the app

| Component | License |
|---|---|
| [Inter Tight](https://fonts.google.com/specimen/Inter+Tight) | SIL OFL 1.1 (`src/ui/fonts/OFL.txt`) |
| [Lucide](https://lucide.dev) (icons) | ISC |
| [Svelte](https://svelte.dev) | MIT |

## Services

Lyrics come from [LRCLIB](https://lrclib.net) and [Spicy Lyrics](https://spicylyrics.org). Each lyric shows its credit. Track
metadata optionally comes from the Spotify Web API with your own Client ID.

## Trademarks

Apple Music, Spotify and TikTok are trademarks of their owners. This project is not affiliated with or endorsed by them.
