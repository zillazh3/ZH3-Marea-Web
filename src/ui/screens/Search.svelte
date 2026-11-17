<script lang="ts">
  import { SvelteMap } from 'svelte/reactivity';
  import { trackKind, type LrclibTrack } from '@/features/providers/lrclib';
  import type { SpotifyTrack } from '@/features/providers/spotify';
  import { toneFor } from '@/features/storage/meta';
  import { createFromSpotifyTrack, createFromTrack } from '../actions';
  import Badge from '../components/Badge.svelte';
  import Button from '../components/Button.svelte';
  import Empty from '../components/Empty.svelte';
  import ScreenHead from '../components/ScreenHead.svelte';
  import { describeError } from '../errors';
  import { i18n } from '../i18n.svelte';
  import Icon from '../icons/Icon.svelte';
  import { lrclib } from '../services';
  import Cover from '../shell/Cover.svelte';
  import { spicyKey } from '../state/spicyKey.svelte';
  import { spotifyStatus } from '../state/spotify.svelte';

  /** Wait for a pause in typing so each keystroke does not become a request. */
  const DEBOUNCE_MS = 350;
  const MIN_QUERY_LENGTH = 2;
  /** Songs with syllable timing first, then line timing, then the ones without lyrics. */
  const KIND_RANK = { syllable: 0, line: 1, none: 2 } as const;

  type UnifiedTrack =
    | {
        readonly source: 'spotify';
        readonly key: string;
        readonly track: SpotifyTrack;
        readonly badgeKind: 'syllable' | 'line' | 'none' | null;
      }
    | {
        readonly source: 'lrclib';
        readonly key: string;
        readonly track: LrclibTrack;
        readonly badgeKind: 'syllable' | 'line' | 'none';
      };

  type Status =
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'done'; items: readonly UnifiedTrack[]; fallbackNote: string }
    | { kind: 'failed'; message: string };

  function normKey(title: string, artist: string): string {
    return `${title.trim().toLowerCase()}|${artist.split(',')[0]?.trim().toLowerCase() ?? ''}`;
  }

  const m = $derived(i18n.m);
  let query = $state('');
  let status = $state.raw<Status>({ kind: 'idle' });
  /** Key of the track whose lyrics are being opened, so its button cannot be pressed twice. */
  let opening = $state<string | null>(null);

  $effect(() => {
    const text = query.trim();
    const useSpotify = spotifyStatus.connected;
    if (text.length < MIN_QUERY_LENGTH) {
      status = { kind: 'idle' };
      return;
    }
    status = { kind: 'loading' };
    let stale = false;
    const timer = setTimeout(() => {
      if (!useSpotify) {
        lrclib.search(text).then(
          (found) => {
            if (stale) return;
            const items: UnifiedTrack[] = found
              .toSorted((a, b) => KIND_RANK[trackKind(a)] - KIND_RANK[trackKind(b)])
              .map((track) => ({
                source: 'lrclib',
                key: `lrc-${String(track.id)}`,
                track,
                badgeKind: trackKind(track),
              }));
            status = { kind: 'done', items, fallbackNote: '' };
          },
          (error: unknown) => {
            if (!stale) status = { kind: 'failed', message: describeError(i18n.m, error) };
          },
        );
        return;
      }

      void Promise.allSettled([spotifyStatus.search(text), lrclib.search(text)]).then(
        ([spRes, lrcRes]) => {
          if (stale) return;
          const lrcTracks = lrcRes.status === 'fulfilled' ? lrcRes.value : [];
          if (spRes.status === 'fulfilled') {
            const byKey = new SvelteMap<string, LrclibTrack>();
            for (const lt of lrcTracks) {
              const k = normKey(lt.trackName, lt.artistName);
              const prev = byKey.get(k);
              if (!prev || KIND_RANK[trackKind(lt)] < KIND_RANK[trackKind(prev)]) {
                byKey.set(k, lt);
              }
            }
            const items: UnifiedTrack[] = spRes.value.map((track) => {
              const matched = byKey.get(normKey(track.title, track.artist));
              return {
                source: 'spotify',
                key: `sp-${track.id}`,
                track,
                badgeKind: matched ? trackKind(matched) : null,
              };
            });
            status = { kind: 'done', items, fallbackNote: '' };
            return;
          }
          if (lrcRes.status === 'fulfilled') {
            const items: UnifiedTrack[] = lrcTracks
              .toSorted((a, b) => KIND_RANK[trackKind(a)] - KIND_RANK[trackKind(b)])
              .map((track) => ({
                source: 'lrclib',
                key: `lrc-${String(track.id)}`,
                track,
                badgeKind: trackKind(track),
              }));
            status = { kind: 'done', items, fallbackNote: i18n.m.search.spotifyFallback };
            return;
          }
          status = { kind: 'failed', message: describeError(i18n.m, spRes.reason) };
        },
      );
    }, DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  });

  async function create(item: UnifiedTrack): Promise<void> {
    opening = item.key;
    if (item.source === 'spotify') {
      await createFromSpotifyTrack(item.track);
    } else {
      await createFromTrack(item.track);
    }
    opening = null;
  }
</script>

<ScreenHead
  title={m.nav.search}
  subtitle={spotifyStatus.connected ? m.search.subtitleSpotify : m.search.subtitle}
/>

<div class="search-box">
  <Icon name="search" />
  <input
    type="search"
    bind:value={query}
    placeholder={m.search.placeholder}
    aria-label={m.search.label}
    autocomplete="off"
  />
</div>

<div class="results" aria-live="polite">
  {#if status.kind === 'idle'}
    <p class="note">{m.search.prompt}</p>
  {:else if status.kind === 'loading'}
    <p class="note">{m.search.searching}</p>
  {:else if status.kind === 'failed'}
    <p class="note" role="alert">{status.message}</p>
  {:else if status.items.length === 0}
    <Empty title={m.search.emptyTitle} hint={m.search.emptyHint} />
  {:else}
    {#if status.fallbackNote}
      <p class="note">{status.fallbackNote}</p>
    {/if}
    {#each status.items as item (item.key)}
      {@const title = item.source === 'spotify' ? item.track.title : item.track.trackName}
      {@const artist = item.source === 'spotify' ? item.track.artist : item.track.artistName}
      {@const coverUrl = item.source === 'spotify' ? item.track.coverUrl : null}
      {@const disabled =
        opening !== null ||
        (item.source === 'lrclib' && item.badgeKind === 'none') ||
        (item.source === 'spotify' && item.badgeKind === 'none' && !spicyKey.value)}
      <div class="result">
        <div class="art">
          {#if coverUrl}
            <img src={coverUrl} alt="" />
          {:else}
            <Cover tone={toneFor(title, artist)} />
          {/if}
        </div>
        <div class="text">
          <div class="title">{title}</div>
          <div class="artist">{artist}</div>
        </div>
        {#if item.badgeKind}
          <Badge kind={item.badgeKind} label={m.search.kind[item.badgeKind]} />
        {:else}
          <span class="sp-pill">{m.search.spotifyBadge}</span>
        {/if}
        <Button
          {disabled}
          title={item.badgeKind === 'none' && !spicyKey.value ? m.search.noSyncedLyrics : undefined}
          onclick={() => void create(item)}
        >
          {opening === item.key ? m.search.fetching : m.search.createClip}
        </Button>
      </div>
    {/each}
  {/if}
</div>

<style>
  .search-box {
    position: relative;
    max-width: 640px;
    margin-bottom: var(--space-4);
    color: var(--faint);
    --icon-size: 18px;
  }

  .search-box :global(.icon) {
    position: absolute;
    left: 14px;
    top: 50%;
    transform: translateY(-50%);
  }

  input {
    width: 100%;
    height: 46px;
    padding: 0 var(--space-3) 0 44px;
    border-radius: var(--r-card);
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    font-size: var(--fs-md);
    outline: none;
  }

  input:focus {
    border-color: var(--accent);
  }

  .results {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-width: 860px;
  }

  .note {
    color: var(--muted);
    padding: var(--space-3) 0;
  }

  .result {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr) auto auto;
    gap: 14px;
    align-items: center;
    padding: var(--space-2) 10px;
    border-radius: 12px;
  }

  .result:hover {
    background: var(--hover);
  }

  .art {
    width: 48px;
    height: 48px;
    border-radius: 8px;
    overflow: hidden;
  }

  .art img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .sp-pill {
    font-size: var(--fs-xs);
    color: var(--ok);
    background: var(--pill);
    padding: 4px 10px;
    border-radius: var(--r-pill);
  }

  .title {
    font-weight: 600;
  }

  .artist {
    font-size: var(--fs-sm);
    color: var(--muted);
  }

  .title,
  .artist {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 760px) {
    .result {
      grid-template-columns: 48px minmax(0, 1fr) auto;
    }

    .result :global(.badge) {
      display: none;
    }
  }
</style>
