import { ChainProvider } from '@/features/providers/chain';
import { LrclibProvider } from '@/features/providers/lrclib';
import { SpicyLyricsProvider } from '@/features/providers/spicy';
import { idbLyricsCache } from '@/features/storage/lyricsCache';
import { spicyKey } from './state/spicyKey.svelte';

// One instance of each provider for the whole app, so throttle and cache are shared.
export const lrclib = new LrclibProvider({ cache: idbLyricsCache });
export const spicy = new SpicyLyricsProvider({ key: () => spicyKey.value, cache: idbLyricsCache });
export const lyricsChain = new ChainProvider([spicy, lrclib]);
