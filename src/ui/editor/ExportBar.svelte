<script lang="ts">
  import {
    EXPORT_MARKERS,
    EXPORT_MODES,
    EXPORT_OUTROS_MS,
    type ExportFormatId,
    type ExportMarker,
    type ExportMode,
    type ExportOutroMs,
  } from '@/export/presets';
  import Segmented from '../components/Segmented.svelte';
  import { i18n } from '../i18n.svelte';
  import Icon from '../icons/Icon.svelte';
  import type { EditorController } from './editorState.svelte';

  interface Props {
    editor: EditorController;
  }

  const { editor }: Props = $props();

  const STORAGE_KEY = 'zh3marea.exportPrefs';
  const FORMATS: readonly ExportFormatId[] = ['tiktok', 'square', 'wide'];

  interface StoredPrefs {
    mode: ExportMode;
    format: ExportFormatId;
    marker: ExportMarker;
    outroMs: ExportOutroMs;
  }

  function loadPrefs(): StoredPrefs {
    const defaults: StoredPrefs = {
      mode: 'lyrics',
      format: 'tiktok',
      marker: 'none',
      outroMs: 500,
    };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaults;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return defaults;
      const obj = parsed as Record<string, unknown>;
      const mode = EXPORT_MODES.includes(obj.mode as ExportMode)
        ? (obj.mode as ExportMode)
        : defaults.mode;
      const format = FORMATS.includes(obj.format as ExportFormatId)
        ? (obj.format as ExportFormatId)
        : defaults.format;
      const marker = EXPORT_MARKERS.includes(obj.marker as ExportMarker)
        ? (obj.marker as ExportMarker)
        : defaults.marker;
      const outroMs = EXPORT_OUTROS_MS.includes(obj.outroMs as ExportOutroMs)
        ? (obj.outroMs as ExportOutroMs)
        : defaults.outroMs;
      return { mode, format, marker, outroMs };
    } catch {
      return defaults;
    }
  }

  function savePrefs(next: StoredPrefs): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private browsing / quota refusal does not block exporting with current choices.
    }
  }

  const initial = loadPrefs();
  let mode = $state<ExportMode>(initial.mode);
  let format = $state<ExportFormatId>(initial.format);
  let marker = $state<ExportMarker>(initial.marker);
  let outroMs = $state<ExportOutroMs>(initial.outroMs);
  let menuOpen = $state(false);
  let splitWrap: HTMLDivElement | undefined = $state();

  $effect(() => {
    editor.setExportOptions({ mode, format, marker, outroMs });
  });

  const m = $derived(i18n.m.editor.exportBar);
  const modeOptions = $derived(
    EXPORT_MODES.map((value) => ({
      value,
      label: m.modes[value],
    })),
  );
  const summaryText = $derived(
    m.summary(
      m.modes[mode],
      mode === 'full' ? null : editor.first + 1,
      mode === 'full' ? null : editor.last + 1,
      m.resolutions[format],
    ),
  );

  function persist(): void {
    savePrefs({ mode, format, marker, outroMs });
  }

  function onFormatChange(event: Event & { currentTarget: HTMLSelectElement }): void {
    const val = event.currentTarget.value as ExportFormatId;
    if (FORMATS.includes(val)) {
      format = val;
      persist();
    }
  }

  function onWindowPointerDown(event: PointerEvent): void {
    if (!menuOpen || !splitWrap) return;
    if (event.target instanceof Node && !splitWrap.contains(event.target)) {
      menuOpen = false;
    }
  }

  function onWindowKeyDown(event: KeyboardEvent): void {
    if (menuOpen && event.key === 'Escape') {
      event.stopPropagation();
      menuOpen = false;
    }
  }

  function startExport(): void {
    menuOpen = false;
    editor.enqueueExport({ mode, format, marker, outroMs });
  }
</script>

<svelte:window onpointerdown={onWindowPointerDown} onkeydown={onWindowKeyDown} />

<div class="export-bar">
  <div class="mode-scroll">
    <Segmented
      label={m.modeLabel}
      value={mode}
      options={modeOptions}
      onchange={(next: ExportMode) => {
        mode = next;
        persist();
      }}
    />
  </div>

  <select class="format-select" aria-label={m.formatLabel} value={format} onchange={onFormatChange}>
    {#each FORMATS as fmt (fmt)}
      <option value={fmt}>{m.formats[fmt]}</option>
    {/each}
  </select>

  <div class="summary">{summaryText}</div>

  <div class="split-wrap" bind:this={splitWrap}>
    <div class="split">
      <button type="button" class="primary main-btn" onclick={startExport}>
        <Icon name="download" />
        <span>{m.button}</span>
      </button>
      <button
        type="button"
        class="primary menu-btn"
        aria-label={m.menuLabel}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onclick={() => {
          menuOpen = !menuOpen;
        }}
      >
        <Icon name="chevron-down" />
      </button>
    </div>

    {#if menuOpen}
      <div class="menu" role="menu" aria-label={m.menuLabel}>
        <div class="group-title">{m.marker}</div>
        {#each EXPORT_MARKERS as item (item)}
          <button
            type="button"
            class="mi"
            role="menuitemradio"
            aria-checked={marker === item}
            onclick={() => {
              marker = item;
              persist();
              menuOpen = false;
            }}
          >
            <span>{m.markers[item]}</span>
            <span class="check">{marker === item ? '✓' : ''}</span>
          </button>
        {/each}

        <hr />

        <div class="group-title">{m.outro}</div>
        {#each EXPORT_OUTROS_MS as ms (ms)}
          {@const key = String(ms) as keyof typeof m.outros}
          <button
            type="button"
            class="mi"
            role="menuitemradio"
            aria-checked={outroMs === ms}
            onclick={() => {
              outroMs = ms;
              persist();
              menuOpen = false;
            }}
          >
            <span>{m.outros[key]}</span>
            <span class="check">{outroMs === ms ? '✓' : ''}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .export-bar {
    position: sticky;
    bottom: var(--space-3);
    z-index: 5;
    margin-top: var(--space-4);
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
    padding: 10px 10px 10px 14px;
    border-radius: var(--r-card);
    background: var(--rail-bg);
    border: 1px solid var(--border);
    backdrop-filter: blur(22px);
    -webkit-backdrop-filter: blur(22px);
  }

  .mode-scroll {
    max-width: 100%;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .format-select {
    height: 36px;
    padding: 0 var(--space-3);
    border-radius: var(--r-ctl);
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    font-size: var(--fs-sm);
    outline: none;
  }

  .format-select:focus {
    border-color: var(--accent);
  }

  .format-select option {
    background: var(--pop-bg);
    color: var(--text);
  }

  .summary {
    flex: 1;
    min-width: 160px;
    font-size: var(--fs-sm);
    color: var(--muted);
  }

  .split-wrap {
    position: relative;
    margin-left: auto;
  }

  .split {
    display: inline-flex;
  }

  .primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    height: 36px;
    background: var(--grad);
    color: var(--on-accent);
    font-weight: 600;
    font-size: var(--fs-sm);
    white-space: nowrap;
    --icon-size: 16px;
  }

  .primary:hover {
    background: var(--grad-hover);
  }

  .main-btn {
    padding: 0 var(--space-4);
    border-radius: var(--r-ctl) 0 0 var(--r-ctl);
  }

  .menu-btn {
    padding: 0 10px;
    border-radius: 0 var(--r-ctl) var(--r-ctl) 0;
    border-left: 1px solid var(--border);
  }

  .menu {
    position: absolute;
    right: 0;
    bottom: calc(100% + var(--space-2));
    z-index: 40;
    min-width: 240px;
    padding: 6px;
    border-radius: var(--r-nav);
    background: var(--pop-bg);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-menu);
  }

  .group-title {
    padding: 6px 10px 4px;
    font-size: var(--fs-xs);
    font-weight: 600;
    color: var(--faint);
  }

  .mi {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-4);
    width: 100%;
    padding: 7px 10px;
    border-radius: var(--r-ctl);
    font-size: var(--fs-sm);
    text-align: left;
  }

  .mi:hover {
    background: var(--pill);
  }

  .check {
    color: var(--accent-icon);
    font-weight: 700;
    min-width: 14px;
    text-align: right;
  }

  .menu hr {
    border: 0;
    height: 1px;
    background: var(--border);
    margin: 4px 6px;
  }

  @media (max-width: 760px) {
    .export-bar {
      position: static;
      padding: var(--space-3);
    }

    .summary {
      flex-basis: 100%;
      min-width: 0;
    }
  }
</style>
