<script lang="ts">
  import { onDestroy } from 'svelte';
  import { lineText } from '@/engine/lyrics';
  import type { Lyrics } from '@/features/lyrics/model';
  import { creditLines } from '@/render/text';
  import Icon from '../icons/Icon.svelte';
  import { i18n } from '../i18n.svelte';
  import { formatTimecode, type EditorController } from './editorState.svelte';

  interface Props {
    editor: EditorController;
    lyrics: Lyrics;
  }

  const HOLD_MS = 1003;
  const DRAG_SLOP_PX = 8;
  const AUTO_SCROLL_EDGE_PX = 36;
  const AUTO_SCROLL_STEP_PX = 6;

  const { editor, lyrics }: Props = $props();
  const m = $derived(i18n.m.editor);
  const credits = $derived(creditLines(lyrics.writers, lyrics.credit));
  const rangeSpanMs = $derived.by(() => {
    const slice = lyrics.lines.slice(editor.first, editor.last + 1);
    const head = slice[0];
    if (!head) return 0;
    const maxEnd = slice.reduce((acc, line) => Math.max(acc, line.end), head.end);
    return Math.max(0, maxEnd - head.start);
  });

  let listEl: HTMLUListElement | undefined = $state();
  let holdRow = $state<number | null>(null);
  let dragAnchor = $state<number | null>(null);

  let activePointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let lastClientY = 0;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let scrollRafId: number | null = null;
  let suppressClick = false;
  let suppressResetTimer: ReturnType<typeof setTimeout> | null = null;

  function rowFromClientY(clientY: number): number | null {
    if (!listEl) return null;
    const rows = listEl.querySelectorAll<HTMLButtonElement>('[data-verse-row]');
    if (rows.length === 0) return null;
    for (let i = 0; i < rows.length; i += 1) {
      const btn = rows[i];
      if (!btn) continue;
      const rect = btn.getBoundingClientRect();
      if (clientY < rect.top) return Math.max(0, i - 1);
      if (clientY <= rect.bottom) return i;
    }
    return rows.length - 1;
  }

  function applyDragAt(clientY: number): void {
    if (dragAnchor === null) return;
    const row = rowFromClientY(clientY);
    if (row === null) return;
    editor.setVerseRange(Math.min(dragAnchor, row), Math.max(dragAnchor, row));
  }

  function stepAutoScroll(): void {
    scrollRafId = null;
    if (dragAnchor === null || !listEl) return;
    const rect = listEl.getBoundingClientRect();
    let delta = 0;
    if (lastClientY < rect.top + AUTO_SCROLL_EDGE_PX) {
      delta = -AUTO_SCROLL_STEP_PX;
    } else if (lastClientY > rect.bottom - AUTO_SCROLL_EDGE_PX) {
      delta = AUTO_SCROLL_STEP_PX;
    }
    if (delta !== 0) {
      const prevTop = listEl.scrollTop;
      listEl.scrollTop += delta;
      if (listEl.scrollTop !== prevTop) applyDragAt(lastClientY);
    }
    scrollRafId = requestAnimationFrame(stepAutoScroll);
  }

  function startAutoScroll(): void {
    if (scrollRafId !== null) return;
    scrollRafId = requestAnimationFrame(stepAutoScroll);
  }

  function stopAutoScroll(): void {
    if (scrollRafId !== null) {
      cancelAnimationFrame(scrollRafId);
      scrollRafId = null;
    }
  }

  function clearInteraction(): void {
    if (holdTimer !== null) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    stopAutoScroll();
    window.removeEventListener('pointermove', onWindowPointerMove);
    window.removeEventListener('pointerup', onWindowPointerEnd);
    window.removeEventListener('pointercancel', onWindowPointerEnd);
    window.removeEventListener('touchmove', onWindowTouchMove);
    activePointerId = null;
    holdRow = null;
    dragAnchor = null;
  }

  function onWindowTouchMove(event: TouchEvent): void {
    // Once long-press drag locks in, block browser touch scrolling/pull-to-refresh.
    if (dragAnchor !== null && event.cancelable) {
      event.preventDefault();
    }
  }

  function onWindowPointerMove(event: PointerEvent): void {
    if (event.pointerId !== activePointerId) return;
    lastClientY = event.clientY;
    if (dragAnchor === null) {
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > DRAG_SLOP_PX) {
        clearInteraction();
      }
      return;
    }
    applyDragAt(event.clientY);
    startAutoScroll();
  }

  function onWindowPointerEnd(event: PointerEvent): void {
    if (event.pointerId !== activePointerId) return;
    const wasDragging = dragAnchor !== null;
    clearInteraction();
    if (wasDragging) {
      suppressClick = true;
      if (suppressResetTimer !== null) clearTimeout(suppressResetTimer);
      suppressResetTimer = setTimeout(() => {
        suppressResetTimer = null;
        suppressClick = false;
      }, 0);
    }
  }

  function onRowPointerDown(idx: number, event: PointerEvent): void {
    if (!event.isPrimary) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    clearInteraction();
    activePointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    lastClientY = event.clientY;
    holdRow = idx;
    suppressClick = false;

    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', onWindowPointerEnd);
    window.addEventListener('pointercancel', onWindowPointerEnd);
    window.addEventListener('touchmove', onWindowTouchMove, { passive: false });

    holdTimer = setTimeout(() => {
      holdTimer = null;
      holdRow = null;
      dragAnchor = idx;
      suppressClick = true;
      editor.anchor = idx;
      editor.setVerseRange(idx, idx);
      if ('vibrate' in navigator) navigator.vibrate(15);
      applyDragAt(lastClientY);
      startAutoScroll();
    }, HOLD_MS);
  }

  onDestroy(() => {
    clearInteraction();
    if (suppressResetTimer !== null) {
      clearTimeout(suppressResetTimer);
      suppressResetTimer = null;
    }
  });
</script>

<div class="card verses">
  <div class="head-row">
    <p class="caption">{m.versesHint}</p>
    <div class="touch-range" aria-label={m.extendRange}>
      <button
        type="button"
        class="step-btn"
        aria-label="-"
        disabled={editor.last <= editor.first}
        onclick={() => {
          editor.extendVerseRange(0, -1);
        }}
      >
        <Icon name="minus" />
      </button>
      <button
        type="button"
        class="step-btn"
        aria-label="+"
        disabled={editor.last >= lyrics.lines.length - 1}
        onclick={() => {
          editor.extendVerseRange(0, 1);
        }}
      >
        <Icon name="plus" />
      </button>
    </div>
  </div>

  <ul
    class="vlist"
    class:dragging={dragAnchor !== null}
    style:--hold-ms="{HOLD_MS}ms"
    bind:this={listEl}
  >
    {#each lyrics.lines as line, idx (idx)}
      {@const inside = idx >= editor.first && idx <= editor.last}
      {@const isFirst = idx === editor.first}
      {@const isLast = idx === editor.last}
      <li>
        <button
          type="button"
          data-verse-row={idx}
          class:in={inside}
          class:first={inside && isFirst}
          class:last={inside && isLast}
          class:mid={inside && !isFirst && !isLast}
          class:edge={inside && (isFirst || isLast)}
          class:holding={holdRow === idx}
          class:drag-anchor={dragAnchor === idx}
          aria-pressed={inside}
          onpointerdown={(event) => {
            onRowPointerDown(idx, event);
          }}
          oncontextmenu={(event) => {
            if (holdRow !== null || dragAnchor !== null || suppressClick) {
              event.preventDefault();
            }
          }}
          onclick={(event) => {
            if (suppressClick) {
              suppressClick = false;
              return;
            }
            editor.selectVerse(idx, event.shiftKey);
          }}
          ondblclick={() => {
            editor.playFromVerse(idx);
          }}
        >
          <span class="num">{idx + 1}</span>
          <span class="txt">{lineText(line)}</span>
        </button>
      </li>
    {/each}
  </ul>

  <div class="range-label">
    {m.rangeSummary(editor.first + 1, editor.last + 1, formatTimecode(rangeSpanMs))}
  </div>

  {#if credits.length > 0}
    <p class="caption credit">
      {credits.map(([label, text]) => `${label} ${text}`).join(' · ')}
    </p>
  {/if}
</div>

<style>
  .verses {
    padding: var(--space-3) var(--space-2);
    max-height: 310px;
    display: flex;
    flex-direction: column;
  }

  .head-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: 0 var(--space-2) 6px;
  }

  .caption {
    font-size: var(--fs-xs);
    color: var(--faint);
  }

  .touch-range {
    display: flex;
    gap: 4px;
    flex: none;
  }

  .step-btn {
    --icon-size: 13px;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 7px;
    border: 1px solid var(--border);
    color: var(--muted);
  }

  .step-btn:hover:not(:disabled) {
    background: var(--hover);
    color: var(--text);
  }

  .step-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .vlist {
    list-style: none;
    overflow: auto;
    flex: 1;
    touch-action: pan-y;
  }

  .vlist.dragging {
    touch-action: none;
    cursor: ns-resize;
  }

  .vlist button {
    position: relative;
    overflow: hidden;
    width: 100%;
    display: grid;
    grid-template-columns: 28px 1fr;
    gap: 6px;
    padding: 6px var(--space-2);
    border-radius: 9px;
    text-align: left;
    color: var(--muted);
    font-size: var(--fs-sm);
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }

  .vlist button.holding::before {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--accent-icon);
    opacity: 0.22;
    transform-origin: left center;
    animation: hold-fill var(--hold-ms, 1003ms) linear forwards;
    pointer-events: none;
  }

  .vlist button.drag-anchor {
    outline: 1px solid var(--accent-icon);
    outline-offset: -1px;
  }

  @keyframes hold-fill {
    from {
      transform: scaleX(0);
    }
    to {
      transform: scaleX(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .vlist button.holding::before {
      animation: none;
    }
  }

  .vlist button:hover {
    background: var(--hover);
    color: var(--text);
  }

  .num {
    color: var(--faint);
    font-variant-numeric: tabular-nums;
    font-size: var(--fs-xs);
    text-align: right;
    padding-top: 1px;
  }

  .txt {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .vlist button.in {
    background: var(--pill);
    color: var(--text);
  }

  .vlist button.in.first {
    border-radius: 9px 9px 3px 3px;
  }

  .vlist button.in.last {
    border-radius: 3px 3px 9px 9px;
  }

  .vlist button.in.first.last {
    border-radius: 9px;
  }

  .vlist button.in.mid {
    border-radius: 3px;
  }

  .vlist button.edge .num {
    color: var(--accent-icon);
  }

  .range-label {
    padding: var(--space-2) var(--space-2) 0;
    font-size: var(--fs-sm);
    color: var(--muted);
  }

  .credit {
    padding: var(--space-1) var(--space-2) 0;
  }
</style>
