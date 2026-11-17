<script lang="ts">
  import type { HookReason, HookSuggestion } from '@/features/hooks/analyze';
  import { applyPreset } from '@/features/presets/schema';
  import type { ClipProject } from '@/features/projects/project';
  import Button from '../components/Button.svelte';
  import { i18n } from '../i18n.svelte';
  import { preferences } from '../state/preferences.svelte';
  import { notifications } from '../state/toasts.svelte';
  import { formatTimecode, type EditorController } from './editorState.svelte';

  interface Props {
    editor: EditorController;
    project: ClipProject;
  }

  const PRESET_DURATIONS = [15, 30, 60] as const;
  const MIN_CUSTOM_S = 5;
  const MAX_CUSTOM_S = 180;

  const { editor, project }: Props = $props();
  const m = $derived(i18n.m.editor.hooks);

  let chipChoice = $state<15 | 30 | 60 | 'custom'>(30);
  let customSeconds = $state(25);
  let analyzing = $state(false);
  let results = $state.raw<Record<number, readonly HookSuggestion[]>>({});
  let hasRun = $state(false);
  let lastUsedAudio = $state(false);
  let selectedIndex = $state<number | null>(null);
  let pickingVariants = $state(false);
  let chosenPresets = $state<string[]>([]);
  let trackedProject: ClipProject | null = null;

  const activeTarget = $derived(
    chipChoice === 'custom'
      ? Math.max(MIN_CUSTOM_S, Math.min(MAX_CUSTOM_S, Math.round(customSeconds || 25)))
      : chipChoice,
  );
  const currentList = $derived(results[activeTarget] ?? []);
  const selectedSuggestion = $derived(
    selectedIndex !== null ? (currentList[selectedIndex] ?? null) : null,
  );

  $effect(() => {
    if (project !== trackedProject) {
      trackedProject = project;
      results = {};
      hasRun = false;
      selectedIndex = null;
      pickingVariants = false;
      editor.setHoverRange(null);
    }
  });

  $effect(() => {
    if (activeTarget > 0) {
      selectedIndex = currentList.length > 0 ? 0 : null;
    }
  });

  function formatReasons(reasons: readonly HookReason[]): string {
    return reasons
      .map((r) => {
        switch (r.kind) {
          case 'chorusRepeat':
            return m.reasons.chorusRepeat(r.count);
          case 'lineRepeat':
            return m.reasons.lineRepeat(r.count);
          case 'mentionsTitle':
            return m.reasons.mentionsTitle();
          case 'vocalPeak':
            return m.reasons.vocalPeak(r.timeLabel);
          case 'energyEntry':
            return m.reasons.energyEntry();
          case 'goodDuration':
            return m.reasons.goodDuration();
        }
      })
      .join(', ');
  }

  function formatSpan(s: HookSuggestion): string {
    const firstLine = project.lyrics.lines[s.first];
    const lastLine = project.lyrics.lines[s.last];
    if (!firstLine || !lastLine) return '';
    return `${formatTimecode(firstLine.start)}–${formatTimecode(lastLine.end)}`;
  }

  function runAnalyze(): void {
    analyzing = true;
    try {
      const targets =
        chipChoice === 'custom' ? [...PRESET_DURATIONS, activeTarget] : [...PRESET_DURATIONS];
      const { results: next, usedAudio } = editor.suggestHooksFor(targets);
      results = next;
      hasRun = true;
      lastUsedAudio = usedAudio;
      const shown = next[activeTarget] ?? [];
      selectedIndex = shown.length > 0 ? 0 : null;
    } finally {
      analyzing = false;
    }
  }

  function selectCard(idx: number, s: HookSuggestion): void {
    selectedIndex = idx;
    editor.setVerseRange(s.first, s.last);
  }

  function openVariants(): void {
    if (!selectedSuggestion) return;
    chosenPresets = editor.presets.map((entry) => entry.name);
    pickingVariants = true;
  }

  function togglePreset(name: string): void {
    chosenPresets = chosenPresets.includes(name)
      ? chosenPresets.filter((item) => item !== name)
      : [...chosenPresets, name];
  }

  function queueSelected(): void {
    if (!selectedSuggestion) return;
    editor.enqueueHook(selectedSuggestion);
  }

  function queueVariants(): void {
    const s = selectedSuggestion;
    if (!s || chosenPresets.length === 0) return;
    const selectedEntries = editor.presets.filter((entry) => chosenPresets.includes(entry.name));
    let queued = 0;
    for (const entry of selectedEntries) {
      const look = applyPreset(entry.preset, editor.look);
      if (editor.enqueueHook(s, { look, presetName: entry.name })) {
        queued += 1;
      }
    }
    pickingVariants = false;
    if (queued > 0) notifications.show(m.variantsQueued(queued), 'ok');
  }

  const statusText = $derived.by(() => {
    if (!hasRun) return m.emptyHint;
    if (!(activeTarget in results)) return m.rerunHint;
    if (currentList.length === 0) return m.noResults;
    const suffix = lastUsedAudio ? '' : m.noAudioNote;
    return m.count(currentList.length, suffix);
  });
</script>

<div class="tab-body">
  <div class="target-block">
    <span class="label">{m.targetLabel}</span>
    <div class="chips" role="group" aria-label={m.targetLabel}>
      {#each PRESET_DURATIONS as sec (sec)}
        <button
          type="button"
          class="chip"
          aria-pressed={chipChoice === sec}
          onclick={() => {
            chipChoice = sec;
          }}
        >
          {m.secChip(sec)}
        </button>
      {/each}
      <button
        type="button"
        class="chip"
        aria-pressed={chipChoice === 'custom'}
        onclick={() => {
          chipChoice = 'custom';
        }}
      >
        {m.custom}
      </button>
      {#if chipChoice === 'custom'}
        <input
          class="custom-num"
          type="number"
          min={MIN_CUSTOM_S}
          max={MAX_CUSTOM_S}
          aria-label={m.customSecLabel}
          bind:value={customSeconds}
        />
      {/if}
    </div>
  </div>

  <div class="run-row">
    <Button variant="primary" disabled={analyzing} onclick={runAnalyze}>
      {analyzing ? m.analyzing : m.suggest}
    </Button>
  </div>

  <p class="status">{statusText}</p>

  {#if currentList.length > 0}
    <ul class="suggestions" role="listbox" aria-label={i18n.m.editor.tabs.hooks}>
      {#each currentList as item, idx (`${String(item.first)}-${String(item.last)}-${String(idx)}`)}
        {@const isSel = selectedIndex === idx}
        <li>
          <button
            type="button"
            class="s-card"
            class:selected={isSel}
            role="option"
            aria-selected={isSel}
            onmouseenter={() => {
              editor.setHoverRange([item.first, item.last]);
            }}
            onmouseleave={() => {
              editor.setHoverRange(null);
            }}
            onfocus={() => {
              editor.setHoverRange([item.first, item.last]);
            }}
            onblur={() => {
              editor.setHoverRange(null);
            }}
            onclick={() => {
              selectCard(idx, item);
            }}
          >
            <span class="s-head"
              >{m.versesRange(item.first + 1, item.last + 1, formatSpan(item))}</span
            >
            <span class="s-sub">
              {m.meta(
                Math.round(item.durationMs / 1000),
                Math.round(item.score),
                m.confidence[item.confidenceLevel],
              )}
            </span>
            <span class="s-why">{formatReasons(item.reasons)}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if pickingVariants}
    <div class="variants-box" role="region" aria-label={m.variantsPrompt}>
      <p class="v-title">{m.variantsPrompt}</p>
      <div class="v-list">
        {#each editor.presets as entry (entry.name)}
          <label class="v-item">
            <input
              type="checkbox"
              checked={chosenPresets.includes(entry.name)}
              onchange={() => {
                togglePreset(entry.name);
              }}
            />
            <span>{entry.name}</span>
          </label>
        {/each}
      </div>
      <div class="v-actions">
        <Button variant="primary" disabled={chosenPresets.length === 0} onclick={queueVariants}>
          {m.variantsConfirm}
        </Button>
        <Button
          onclick={() => {
            pickingVariants = false;
          }}
        >
          {m.variantsCancel}
        </Button>
      </div>
    </div>
  {:else}
    <div class="actions">
      <Button disabled={!selectedSuggestion} onclick={queueSelected}>{m.queue}</Button>
      <Button disabled={!selectedSuggestion || editor.presets.length === 0} onclick={openVariants}>
        {m.variants}
      </Button>
    </div>
  {/if}
</div>

<!-- Keeps dependency on preferences reactive when tab is open cleanly. -->
{#if preferences.value.wordfxExperimental}{/if}

<style>
  .tab-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .target-block {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .label {
    font-size: var(--fs-xs);
    color: var(--muted);
    font-weight: 500;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }

  .chip {
    height: 30px;
    padding: 0 10px;
    border-radius: var(--r-pill);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--muted);
    font-size: var(--fs-xs);
    font-weight: 500;
  }

  .chip:hover {
    background: var(--hover);
    color: var(--text);
  }

  .chip[aria-pressed='true'] {
    background: var(--pill);
    border-color: var(--accent-icon);
    color: var(--text);
  }

  .custom-num {
    width: 68px;
    height: 30px;
    padding: 0 var(--space-2);
    border-radius: var(--r-ctl);
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    font-size: var(--fs-xs);
    font-variant-numeric: tabular-nums;
  }

  .run-row {
    display: flex;
  }

  .status {
    font-size: var(--fs-xs);
    color: var(--faint);
  }

  .suggestions {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 220px;
    overflow: auto;
  }

  .s-card {
    width: 100%;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--r-ctl);
    background: var(--surface);
    border: 1px solid var(--border);
  }

  .s-card:hover {
    background: var(--hover);
  }

  .s-card.selected {
    background: var(--pill);
    border-color: var(--accent-icon);
  }

  .s-head {
    font-size: var(--fs-sm);
    font-weight: 600;
    color: var(--text);
  }

  .s-sub {
    font-size: var(--fs-xs);
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .s-why {
    font-size: var(--fs-xs);
    color: var(--faint);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .variants-box {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    border-radius: var(--r-ctl);
    background: var(--surface-2);
    border: 1px solid var(--border);
  }

  .v-title {
    font-size: var(--fs-xs);
    color: var(--muted);
    font-weight: 500;
  }

  .v-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 120px;
    overflow: auto;
  }

  .v-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--fs-sm);
    color: var(--text);
    cursor: pointer;
  }

  .v-actions {
    display: flex;
    gap: var(--space-2);
  }
</style>
