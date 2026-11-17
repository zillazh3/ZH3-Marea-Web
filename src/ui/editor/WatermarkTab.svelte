<script lang="ts">
  import type { WatermarkSide } from '@/render/style';
  import Segmented from '../components/Segmented.svelte';
  import Switch from '../components/Switch.svelte';
  import { i18n } from '../i18n.svelte';
  import type { EditorController } from './editorState.svelte';

  interface Props {
    editor: EditorController;
  }

  const { editor }: Props = $props();
  const m = $derived(i18n.m.editor.watermark);
  const style = $derived(editor.look.style);

  const sideOptions = $derived<readonly { value: WatermarkSide; label: string }[]>([
    { value: 'left', label: m.left },
    { value: 'right', label: m.right },
  ]);

  function setStyle(patch: Partial<typeof style>): void {
    editor.updateLook({ style: { ...style, ...patch } });
  }
</script>

<div class="tab-body">
  <label class="field">
    <span>{m.text}</span>
    <input
      type="text"
      class="input"
      maxlength="60"
      placeholder={m.textPlaceholder}
      value={style.wmText}
      oninput={(e) => {
        setStyle({ wmText: e.currentTarget.value });
      }}
    />
  </label>

  <div class="row">
    <span class="label">{m.side}</span>
    <Segmented
      label={m.side}
      value={style.wmSide}
      options={sideOptions}
      onchange={(side: WatermarkSide) => {
        setStyle({ wmSide: side });
      }}
    />
  </div>

  <div class="row">
    <span class="label">{m.glyph}</span>
    <Switch
      checked={style.wmGlyph}
      label={m.glyph}
      onchange={(v: boolean) => {
        setStyle({ wmGlyph: v });
      }}
    />
  </div>

  <label class="slider-row">
    <span>{m.alpha}</span>
    <input
      type="range"
      min="0"
      max="100"
      aria-label={m.alpha}
      value={Math.round(style.wmAlpha * 100)}
      oninput={(e) => {
        setStyle({ wmAlpha: Number(e.currentTarget.value) / 100 });
      }}
    />
    <output>{Math.round(style.wmAlpha * 100)}%</output>
  </label>

  <p class="caption">{m.hint}</p>
</div>

<style>
  .tab-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: var(--fs-sm);
    color: var(--muted);
  }

  .input {
    height: 36px;
    padding: 0 var(--space-3);
    border-radius: var(--r-ctl);
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    font-size: var(--fs-sm);
  }

  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-3);
  }

  .label {
    font-size: var(--fs-sm);
  }

  .slider-row {
    display: grid;
    grid-template-columns: 108px 1fr 56px;
    gap: var(--space-2);
    align-items: center;
    font-size: var(--fs-sm);
    color: var(--muted);
  }

  .slider-row input[type='range'] {
    width: 100%;
    accent-color: var(--accent);
  }

  .slider-row output {
    font-size: var(--fs-xs);
    color: var(--faint);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .caption {
    font-size: var(--fs-xs);
    color: var(--faint);
  }
</style>
