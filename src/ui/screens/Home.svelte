<script lang="ts">
  import { openDemo, openProjectFile, openSaved, openTtml } from '../actions';
  import Button from '../components/Button.svelte';
  import ScreenHead from '../components/ScreenHead.svelte';
  import Thumb from '../components/Thumb.svelte';
  import { i18n } from '../i18n.svelte';
  import { router } from '../router/router.svelte';
  import Cover from '../shell/Cover.svelte';
  import { library } from '../state/library.svelte';

  /** Thumbnails in the "recent" strip; the rest live in Biblioteca. */
  const RECENT_COUNT = 12;
  /** Placeholder cover for the welcome card, until there is a song playing. */
  const WELCOME_TONE = 0;

  const m = $derived(i18n.m);
  const recent = $derived(library.items.slice(0, RECENT_COUNT));
</script>

<ScreenHead title={m.nav.home} />

<div class="card hero">
  <div class="art" aria-hidden="true"><Cover tone={WELCOME_TONE} /></div>
  <div>
    <h2>{m.home.welcomeTitle}</h2>
    <p class="sub">{m.home.welcomeSub}</p>
    <div class="actions">
      <Button
        variant="primary"
        onclick={() => {
          router.navigate('search');
        }}>{m.home.searchSong}</Button
      >
      <Button icon="file-up" onclick={() => void openTtml()}>{m.home.openTtml}</Button>
      <Button onclick={() => void openProjectFile()}>{m.home.openProject}</Button>
      <Button onclick={() => void openDemo()}>{m.home.openDemo}</Button>
    </div>
  </div>
</div>

<h2 class="recents-title">{m.home.recents}</h2>
{#if library.loaded && recent.length === 0}
  <p class="caption empty">{m.home.recentsEmpty}</p>
{:else}
  <div class="recents">
    {#each recent as item (item.id)}
      <button
        class="item"
        onclick={() => void openSaved(item.id)}
        aria-label={m.home.openProjectAria(item.title)}
      >
        <Thumb tone={item.tone} lines={item.preview} />
        <span class="caption">{item.title}</span>
      </button>
    {/each}
  </div>
{/if}

<style>
  .hero {
    display: grid;
    grid-template-columns: 200px 1fr;
    gap: var(--space-6);
    padding: var(--space-5);
    align-items: start;
  }

  .art {
    width: 200px;
    height: 200px;
    border-radius: var(--r-card);
    overflow: hidden;
    box-shadow: 0 24px 60px -30px var(--cover-0-c1);
  }

  h2 {
    font-size: var(--fs-lg);
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .hero h2 {
    font-size: 26px;
    margin: var(--space-1) 0;
  }

  .sub {
    color: var(--muted);
    font-size: var(--fs-md);
  }

  .actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: var(--space-5);
  }

  .recents-title {
    margin-top: 28px;
  }

  .caption {
    font-size: var(--fs-xs);
    color: var(--faint);
  }

  .caption.empty {
    margin-top: var(--space-3);
  }

  .recents {
    display: flex;
    gap: var(--space-4);
    overflow-x: auto;
    padding: var(--space-1) var(--space-1) 6px;
    margin-top: var(--space-3);
  }

  .item {
    flex: none;
    width: 108px;
    text-align: left;
  }

  .item .caption {
    display: block;
    margin-top: 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item:hover :global(.thumb) {
    outline: 2px solid var(--accent-icon);
    outline-offset: 2px;
  }

  @media (max-width: 760px) {
    .hero {
      grid-template-columns: 1fr;
      gap: var(--space-4);
    }

    .art {
      width: 120px;
      height: 120px;
    }
  }
</style>
