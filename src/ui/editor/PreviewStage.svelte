<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../icons/Icon.svelte';
  import { i18n } from '../i18n.svelte';
  import { formatTimecode, type EditorController } from './editorState.svelte';

  interface Props {
    editor: EditorController;
  }

  const SCRUB_MAX = 1000;
  const { editor }: Props = $props();
  const m = $derived(i18n.m.editor);

  let canvasEl: HTMLCanvasElement | undefined = $state();
  let scrubbing = $state(false);
  let scrubValue = $state(0);

  const sliderValue = $derived(
    scrubbing
      ? scrubValue
      : Math.round((editor.offsetMs / Math.max(1, editor.durationMs)) * SCRUB_MAX),
  );

  onMount(() => {
    if (canvasEl) editor.attachCanvas(canvasEl);
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== ' ' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, select, textarea, button, a')) {
        return;
      }
      event.preventDefault();
      void editor.togglePlaying();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  });

  function onScrubInput(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    scrubbing = true;
    scrubValue = Number(input.value);
    editor.scrubTo((scrubValue / SCRUB_MAX) * editor.durationMs);
  }

  function onScrubCommit(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    scrubbing = false;
    editor.flushScrub((Number(input.value) / SCRUB_MAX) * editor.durationMs);
  }
</script>

<div class="stage">
  <div class="preview" aria-label={m.previewLabel}>
    <canvas bind:this={canvasEl} width="540" height="960"></canvas>
    {#if editor.previewError}
      <div class="overlay" role="alert">{m.previewError}</div>
    {:else if !editor.previewReady}
      <div class="overlay" aria-live="polite">{m.previewLoading}</div>
    {/if}
  </div>

  <div class="transport">
    <button
      type="button"
      class="play"
      aria-label={editor.playing ? m.pause : m.play}
      disabled={!editor.previewReady}
      onclick={() => void editor.togglePlaying()}
    >
      <Icon name={editor.playing ? 'pause' : 'play'} />
    </button>
    <input
      type="range"
      min="0"
      max={SCRUB_MAX}
      value={sliderValue}
      aria-label={m.scrubLabel}
      disabled={!editor.previewReady}
      oninput={onScrubInput}
      onchange={onScrubCommit}
    />
    <span class="tc">{formatTimecode(editor.offsetMs)} / {formatTimecode(editor.durationMs)}</span>
  </div>
</div>

<style>
  .stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
  }

  .preview {
    position: relative;
    height: min(calc(100vh - 230px), 680px);
    min-height: 360px;
    aspect-ratio: 9 / 16;
    max-width: 100%;
    border-radius: var(--r-preview);
    overflow: hidden;
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-palette);
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }

  .overlay {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: var(--space-5);
    text-align: center;
    background: var(--scrim);
    color: var(--on-accent);
    font-size: var(--fs-sm);
  }

  .transport {
    display: grid;
    grid-template-columns: 40px 1fr auto;
    gap: var(--space-3);
    align-items: center;
    width: min(100%, 520px);
  }

  .play {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: var(--r-pill);
    background: var(--surface);
    border: 1px solid var(--border);
    --icon-size: 18px;
  }

  .play:hover:not(:disabled) {
    background: var(--surface-2);
  }

  .play:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  input[type='range'] {
    width: 100%;
    accent-color: var(--accent);
  }

  .tc {
    font-size: var(--fs-xs);
    color: var(--faint);
    font-variant-numeric: tabular-nums;
    min-width: 96px;
    text-align: right;
  }

  @media (max-width: 980px) {
    .preview {
      height: auto;
      min-height: 0;
      width: min(360px, 100%);
    }
  }
</style>
