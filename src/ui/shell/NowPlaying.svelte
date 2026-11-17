<script lang="ts">
  import Icon from '../icons/Icon.svelte';
  import { i18n } from '../i18n.svelte';
  import { layout } from '../state/layout.svelte';
  import { player } from '../state/player.svelte';
  import { spotifyStatus } from '../state/spotify.svelte';
  import Cover from './Cover.svelte';
  import { tip } from './tooltip.svelte';

  const m = $derived(i18n.m.player);
  // The open clip wins (it has transport controls); otherwise show what Spotify is playing.
  const track = $derived(player.track);
  const spotify = $derived(spotifyStatus.connected ? spotifyStatus.nowPlaying : null);
  const title = $derived(track?.title ?? spotify?.track.title ?? null);
  const subtitle = $derived(
    track?.artist ??
      spotify?.track.artist ??
      (spotifyStatus.connected ? m.playOnSpotify : m.connectSpotify),
  );
</script>

<div
  class="np"
  class:collapsed={layout.railCollapsed}
  role="group"
  aria-label={m.nowPlaying}
  {@attach tip(
    () => (title ? `${title}, ${subtitle}` : m.nothingPlaying),
    () => layout.railCollapsed,
  )}
>
  <div class="cv">
    {#if track}
      <Cover tone={track.tone} />
      <i class="prog" style:width="{player.progress * 100}%"></i>
    {:else if spotify?.track.coverUrl}
      <img src={spotify.track.coverUrl} alt="" />
    {:else}
      <span class="empty"><Icon name="play" /></span>
    {/if}
  </div>
  <div class="meta">
    <div class="t">{title ?? m.nothingPlaying}</div>
    <div class="a">{subtitle}</div>
  </div>
  {#if track}
    <div class="ctl">
      <button class="icon-btn" type="button" aria-label={m.previous} disabled>
        <Icon name="skip-back" />
      </button>
      <button
        class="icon-btn"
        type="button"
        aria-label={player.playing ? m.pause : m.play}
        onclick={() => {
          player.togglePlaying();
        }}
      >
        <Icon name={player.playing ? 'pause' : 'play'} />
      </button>
      <button class="icon-btn" type="button" aria-label={m.next} disabled>
        <Icon name="skip-forward" />
      </button>
    </div>
  {/if}
</div>

<style>
  .np {
    display: grid;
    grid-template-columns: 56px 1fr;
    align-items: center;
    row-gap: 6px;
    padding: var(--space-2) 0;
    margin-top: var(--space-1);
    border-radius: 16px;
    background: var(--surface);
    border: 1px solid var(--border);
  }

  .cv {
    position: relative;
    justify-self: center;
    width: 40px;
    height: 40px;
    border-radius: 9px;
    overflow: hidden;
  }

  .cv img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .empty {
    display: grid;
    place-items: center;
    height: 100%;
    background: var(--surface-2);
    color: var(--faint);
  }

  .prog {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 3px;
    background: var(--on-accent);
    opacity: 0.85;
  }

  .meta {
    min-width: 0;
    padding-right: 10px;
    transition: opacity var(--dur-label);
  }

  .t {
    font-weight: 600;
    font-size: var(--fs-sm);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .a {
    font-size: var(--fs-xs);
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ctl {
    grid-column: 1 / -1;
    display: flex;
    justify-content: center;
    gap: 6px;
    transition: opacity var(--dur-label);
  }

  .icon-btn {
    --icon-size: 16px;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 9px;
    color: var(--text);
  }

  .icon-btn:hover:not(:disabled) {
    background: var(--hover);
  }

  .icon-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .np.collapsed {
    background: none;
    border-color: transparent;
    grid-template-rows: auto 0;
  }

  .np.collapsed .meta,
  .np.collapsed .ctl {
    opacity: 0;
    pointer-events: none;
  }
</style>
