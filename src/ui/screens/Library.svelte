<script lang="ts">
  import { deleteSaved, downloadSaved, openSaved } from '../actions';
  import Empty from '../components/Empty.svelte';
  import ScreenHead from '../components/ScreenHead.svelte';
  import Segmented from '../components/Segmented.svelte';
  import Thumb from '../components/Thumb.svelte';
  import { i18n } from '../i18n.svelte';
  import Icon from '../icons/Icon.svelte';
  import { library } from '../state/library.svelte';

  type Filter = 'all' | 'projects' | 'clips';

  const m = $derived(i18n.m);
  let filter = $state<Filter>('all');
  /** Id of the project whose delete button was pressed once; a second press confirms. */
  let confirming = $state<string | null>(null);

  const options = $derived<{ value: Filter; label: string }[]>([
    { value: 'all', label: m.library.all },
    { value: 'projects', label: m.library.projects },
    { value: 'clips', label: m.library.clips },
  ]);
  // Exported clips arrive with the export milestone; until then only projects exist.
  const items = $derived(filter === 'clips' ? [] : library.items);
</script>

<ScreenHead title={m.nav.library}>
  <Segmented
    label={m.library.filterLabel}
    value={filter}
    {options}
    onchange={(next: Filter) => {
      filter = next;
    }}
  />
</ScreenHead>

{#if library.loaded && items.length === 0}
  {#if filter === 'clips'}
    <Empty title={m.library.noClipsTitle} hint={m.library.noClipsHint} />
  {:else}
    <Empty title={m.library.emptyTitle} hint={m.library.emptyHint} />
  {/if}
{:else}
  <div class="lib">
    {#each items as item (item.id)}
      <div class="entry">
        <button
          class="open"
          onclick={() => void openSaved(item.id)}
          aria-label={m.library.open(item.title)}
        >
          <Thumb tone={item.tone} lines={item.preview} />
        </button>
        <div class="meta">
          <div class="title">{item.title}</div>
          {#if item.artist}<div class="detail">{item.artist}</div>{/if}
          <div class="detail">{m.library.summary(item.lineCount, item.kind)}</div>
        </div>
        <div class="tools">
          <button
            class="tool"
            onclick={() => void downloadSaved(item.id)}
            title={m.library.download}
            aria-label={m.library.download}
          >
            <Icon name="download" />
          </button>
          <button
            class="tool"
            class:danger={confirming === item.id}
            onclick={() => {
              if (confirming === item.id) {
                confirming = null;
                void deleteSaved(item.id, item.title);
              } else {
                confirming = item.id;
              }
            }}
            onblur={() => {
              if (confirming === item.id) confirming = null;
            }}
            title={m.library.delete}
            aria-label={confirming === item.id ? m.library.confirmDelete : m.library.delete}
          >
            {#if confirming === item.id}{m.library.confirmDelete}{:else}<Icon name="trash-2" />{/if}
          </button>
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .lib {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: var(--space-5) var(--space-4);
  }

  .open {
    display: block;
    width: 100%;
  }

  .open:hover :global(.thumb) {
    outline: 2px solid var(--accent-icon);
    outline-offset: 2px;
  }

  .meta {
    margin-top: var(--space-2);
  }

  .title {
    font-weight: 600;
    font-size: var(--fs-sm);
  }

  .detail {
    font-size: var(--fs-xs);
    color: var(--muted);
  }

  .tools {
    display: flex;
    gap: var(--space-1);
    margin-top: var(--space-1);
  }

  .tool {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    height: 32px;
    padding: 0 var(--space-2);
    border-radius: var(--r-ctl);
    color: var(--muted);
    font-size: var(--fs-xs);
    --icon-size: 16px;
  }

  .tool:hover {
    background: var(--hover);
    color: var(--text);
  }

  .tool.danger {
    color: var(--danger);
  }
</style>
