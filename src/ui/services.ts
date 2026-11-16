import { LrclibProvider } from '@/features/providers/lrclib';
import { SpicyLyricsProvider } from '@/features/providers/spicy';
import { idbLyricsCache } from '@/features/storage/lyricsCache';
import { spicyKey } from './state/spicyKey.svelte';

// One instance of each provider for the whole app, so the throttle and the cache are shared. Spicy needs a Spotify track id,
// so it joins the lookup chain together with the Spotify connection; today it only checks the key in Ajustes.
export const lrclib = new LrclibProvider({ cache: idbLyricsCache });
export const spicy = new SpicyLyricsProvider({ key: () => spicyKey.value, cache: idbLyricsCache });
