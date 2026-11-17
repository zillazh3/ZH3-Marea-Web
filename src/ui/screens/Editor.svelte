<script lang="ts">
  import { onDestroy } from 'svelte';
  import { lyricsKind } from '@/features/lyrics/model';
  import Badge from '../components/Badge.svelte';
  import Button from '../components/Button.svelte';
  import Empty from '../components/Empty.svelte';
  import ScreenHead from '../components/ScreenHead.svelte';
  import AudioTab from '../editor/AudioTab.svelte';
  import BackgroundTab from '../editor/BackgroundTab.svelte';
  import { EditorController } from '../editor/editorState.svelte';
  import ExportBar from '../editor/ExportBar.svelte';
  import HooksTab from '../editor/HooksTab.svelte';
  import PreviewStage from '../editor/PreviewStage.svelte';
  import StyleTab from '../editor/StyleTab.svelte';
  import VerseList from '../editor/VerseList.svelte';
  import WatermarkTab from '../editor/WatermarkTab.svelte';
  import { i18n } from '../i18n.svelte';
  import { router } from '../router/router.svelte';
  import { preferences } from '../state/preferences.svelte';
  import { session } from '../state/session.svelte';

  type EditorTab = 'style' | 'background' | 'audio' | 'watermark' | 'hooks';
  const TABS: readonly EditorTab[] = ['style', 'background', 'audio', 'watermark', 'hooks'];

  const m = $derived(i18n.m);
  const project = $derived(session.project);
  const kind = $derived(project ? lyricsKind(project.lyrics) : null);
  const editor = new EditorController();

  let activeTab = $state<EditorTab>('style');
  let loadedProject: typeof project = null;
  let loadedId: string | null = null;

  $effect(() => {
    const p = session.project;
    const id = session.id;
    if (p && (p !== loadedProject || id !== loadedId)) {
      loadedProject = p;
      loadedId = id;
      editor.openProject(p, id);
    } else if (!p) {
      loadedProject = null;
      loadedId = null;
    }
  });

  $effect(() => {
    editor.refreshWordfx(preferences.value.wordfxExperimental);
  });

  onDestroy(() => {
    editor.dispose();
  });

  function onTabKeyDown(event: KeyboardEvent, idx: number): void {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next = (idx + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
    const tab = TABS[next];
    if (tab) activeTab = tab;
    const btn = document.getElementById(`editor-tab-${tab ?? 'style'}`);
    btn?.focus();
  }
</script>

<ScreenHead title={m.nav.editor} />

{#if project && kind}
  <div class="song-head">
    <h2>{project.title || m.editor.untitled}</h2>
    {#if project.artist}<span class="artist">{project.artist}</span>{/if}
    <Badge {kind} label={m.search.kind[kind]} />
  </div>

  <div class="editor">
    <PreviewStage {editor} />

    <div class="panel">
      <VerseList {editor} lyrics={project.lyrics} />

      <div class="card tabs">
        <div class="tablist" role="tablist" aria-label={m.editor.tablistLabel}>
          {#each TABS as tab, idx (tab)}
            <button
              type="button"
              role="tab"
              id="editor-tab-{tab}"
              aria-selected={activeTab === tab}
              aria-controls="editor-pane-{tab}"
              tabindex={activeTab === tab ? 0 : -1}
              onclick={() => {
                activeTab = tab;
              }}
              onkeydown={(e) => {
                onTabKeyDown(e, idx);
              }}
            >
              {m.editor.tabs[tab]}
            </button>
          {/each}
        </div>

        <div
          class="pane"
          role="tabpanel"
          id="editor-pane-{activeTab}"
          aria-labelledby="editor-tab-{activeTab}"
        >
          {#if activeTab === 'style'}
            <StyleTab {editor} />
          {:else if activeTab === 'background'}
            <BackgroundTab {editor} {project} />
          {:else if activeTab === 'audio'}
            <AudioTab {editor} {project} />
          {:else if activeTab === 'watermark'}
            <WatermarkTab {editor} />
          {:else}
            <HooksTab {editor} {project} />
          {/if}
        </div>
        <div class="reset-row">
          <Button
            onclick={() => {
              editor.resetLook();
            }}>{m.editor.resetLook}</Button
          >
        </div>
      </div>
    </div>
  </div>

  <ExportBar {editor} />
{:else}
  <Empty title={m.editor.emptyTitle} hint={m.editor.emptyHint}>
    <Button
      onclick={() => {
        router.navigate('home');
      }}>{m.editor.goHome}</Button
    >
  </Empty>
{/if}

<style>
  .song-head {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    margin: calc(-1 * var(--space-2)) 0 var(--space-4);
    flex-wrap: wrap;
  }

  .song-head h2 {
    font-size: var(--fs-md);
    font-weight: 600;
  }

  .artist {
    font-size: var(--fs-sm);
    color: var(--muted);
  }

  .editor {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 400px;
    gap: var(--space-5);
    align-items: start;
  }

  .editor > * {
    min-width: 0;
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .tabs {
    padding: 6px var(--space-3) var(--space-4);
  }

  .tablist {
    display: flex;
    gap: 2px;
    overflow-x: auto;
    border-bottom: 1px solid var(--border);
    margin: 0 calc(-1 * var(--space-3)) var(--space-3);
    padding: 0 var(--space-2);
    scrollbar-width: none;
  }

  .tablist button {
    padding: 10px 8px;
    color: var(--muted);
    font-weight: 500;
    font-size: var(--fs-sm);
    white-space: nowrap;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    border-radius: 0;
  }

  .tablist button:hover {
    color: var(--text);
  }

  .tablist button[aria-selected='true'] {
    color: var(--text);
    border-bottom-color: var(--accent);
  }

  .reset-row {
    display: flex;
    justify-content: flex-end;
    margin: var(--space-3) calc(-1 * var(--space-3)) 0;
    padding: var(--space-3) var(--space-3) 0;
    border-top: 1px solid var(--border);
  }

  @media (max-width: 980px) {
    .editor {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
