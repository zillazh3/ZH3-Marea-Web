<script lang="ts">
  import { deleteSaved, downloadSaved, openSaved } from '../actions';
  import Empty from '../components/Empty.svelte';
  import ScreenHead from '../components/ScreenHead.svelte';
  import Segmented from '../components/Segmented.svelte';
  import Thumb from '../components/Thumb.svelte';
  import { i18n } from '../i18n.svelte';
  import Icon from '../icons/Icon.svelte';
  import { toneFor } from '@/features/storage/meta';
  import Cover from '../shell/Cover.svelte';
  import { exportQueue } from '../state/exportQueue.svelte';
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
  const projects = $derived(filter === 'clips' ? [] : library.items);
  const clips = $derived(
    filter === 'projects' ? [] : exportQueue.jobs.filter((job) => job.state.kind === 'done'),
  );

  function formatBytes(bytes: number | undefined): string {
    if (!bytes || bytes <= 0) return '';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    return `${String(Math.max(1, Math.round(bytes / 1024)))} KB`;
  }
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

{#if library.loaded && projects.length === 0 && clips.length === 0}
  {#if filter === 'clips'}
    <Empty title={m.library.noClipsTitle} hint={m.library.noClipsHint} />
  {:else}
    <Empty title={m.library.emptyTitle} hint={m.library.emptyHint} />
  {/if}
{:else}
  <div class="lib">
    {#each projects as item (item.id)}
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

    {#each clips as clip (clip.id)}
      {@const sizeText = formatBytes(clip.sizeBytes)}
      <div class="entry">
        <button
          class="open"
          onclick={() => void exportQueue.download(clip.id)}
          aria-label={`${m.exports.download}: ${clip.title || m.editor.untitled}`}
        >
          <span class="clip-thumb">
            {#if clip.thumbUrl}
              <img src={clip.thumbUrl} alt="" />
            {:else}
              <Cover tone={toneFor(clip.title, clip.artist)} />
            {/if}
          </span>
        </button>
        <div class="meta">
          <div class="title">{clip.title || m.editor.untitled}</div>
          {#if clip.artist}<div class="detail">{clip.artist}</div>{/if}
          <div class="detail">
            {clip.width && clip.height ? m.exports.resolutionLabel(clip.width, clip.height) : ''}
            {#if clip.width && clip.height && sizeText}
              ·
            {/if}{sizeText}
          </div>
        </div>
        <div class="tools">
          <button
            class="tool"
            onclick={() => void exportQueue.download(clip.id)}
            title={m.exports.download}
            aria-label={m.exports.download}
          >
            <Icon name="download" />
          </button>
          {#if exportQueue.canShare()}
            <button
              class="tool"
              onclick={() => void exportQueue.share(clip.id)}
              title={m.exports.share}
              aria-label={m.exports.share}
            >
              <Icon name="share-2" />
            </button>
          {/if}
          <button
            class="tool"
            onclick={() => void exportQueue.remove(clip.id)}
            title={m.exports.remove}
            aria-label={m.exports.remove}
          >
            <Icon name="trash-2" />
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

  .open:hover :global(.thumb),
  .open:hover .clip-thumb {
    outline: 2px solid var(--accent-icon);
    outline-offset: 2px;
  }

  .clip-thumb {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 9 / 16;
    border-radius: var(--r-ctl);
    overflow: hidden;
    background: var(--surface-2);
  }

  .clip-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
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
