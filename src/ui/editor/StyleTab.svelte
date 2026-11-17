<script lang="ts">
  import { MOTION_MODES, type MotionMode } from '@/engine/motion';
  import Switch from '../components/Switch.svelte';
  import { i18n } from '../i18n.svelte';
  import PresetsPanel from './PresetsPanel.svelte';
  import type { EditorController } from './editorState.svelte';

  interface Props {
    editor: EditorController;
  }

  const { editor }: Props = $props();
  const m = $derived(i18n.m.editor.style);
  const style = $derived(editor.look.style);
  const params = $derived(editor.look.params);

  function setStyle(patch: Partial<typeof style>): void {
    editor.updateLook({ style: { ...style, ...patch } });
  }

  function setParams(patch: Partial<typeof params>): void {
    editor.updateLook({ params: { ...params, ...patch } });
  }
</script>

<div class="tab-body">
  <PresetsPanel {editor} />

  <div class="toggles">
    <div class="toggle-row">
      <span>{m.bloom}</span>
      <Switch
        checked={style.bloom}
        label={m.bloom}
        onchange={(v: boolean) => {
          setStyle({ bloom: v });
        }}
      />
    </div>
    <div class="toggle-row">
      <span>{m.vib}</span>
      <Switch
        checked={params.vib}
        label={m.vib}
        onchange={(v: boolean) => {
          setParams({ vib: v });
        }}
      />
    </div>
    <div class="toggle-row">
      <span>{m.emph}</span>
      <Switch
        checked={params.emph}
        label={m.emph}
        onchange={(v: boolean) => {
          setParams({ emph: v });
        }}
      />
    </div>
    <div class="toggle-row">
      <span>{m.credit}</span>
      <Switch
        checked={style.credit}
        label={m.credit}
        onchange={(v: boolean) => {
          setStyle({ credit: v });
        }}
      />
    </div>
    <div class="toggle-row">
      <span>{m.reduce}</span>
      <Switch
        checked={params.reduce}
        label={m.reduce}
        onchange={(v: boolean) => {
          setParams({ reduce: v });
        }}
      />
    </div>
  </div>

  <label class="field-row">
    <span>{m.motion}</span>
    <select
      class="select"
      aria-label={m.motion}
      value={params.motion}
      onchange={(e) => {
        setParams({ motion: e.currentTarget.value as MotionMode });
      }}
    >
      {#each MOTION_MODES as mode (mode)}
        <option value={mode}>{m.motionOptions[mode]}</option>
      {/each}
    </select>
  </label>

  <label class="slider-row">
    <span>{m.fontSize}</span>
    <input
      type="range"
      min="40"
      max="100"
      step="2"
      aria-label={m.fontSize}
      value={Math.round(style.fontFrac * 1000)}
      oninput={(e) => {
        setStyle({ fontFrac: Number(e.currentTarget.value) / 1000 });
      }}
    />
    <output>{Math.round(style.fontFrac * 1000)} ‰</output>
  </label>

  <label class="slider-row">
    <span>{m.blur}</span>
    <input
      type="range"
      min="0"
      max="20"
      aria-label={m.blur}
      value={Math.round(params.blurm * 10)}
      oninput={(e) => {
        setParams({ blurm: Number(e.currentTarget.value) / 10 });
      }}
    />
    <output>{params.blurm.toFixed(1)}×</output>
  </label>

  <label class="slider-row">
    <span>{m.wob}</span>
    <input
      type="range"
      min="25"
      max="100"
      aria-label={m.wob}
      value={Math.round(params.wob * 100)}
      oninput={(e) => {
        setParams({ wob: Number(e.currentTarget.value) / 100 });
      }}
    />
    <output>ζ {params.wob.toFixed(2)}</output>
  </label>

  <label class="slider-row">
    <span>{m.motionAmt}</span>
    <input
      type="range"
      min="0"
      max="150"
      aria-label={m.motionAmt}
      value={Math.round(params.motionAmt * 100)}
      oninput={(e) => {
        setParams({ motionAmt: Number(e.currentTarget.value) / 100 });
      }}
    />
    <output>{Math.round(params.motionAmt * 100)}%</output>
  </label>

  <div class="field-row">
    <span>{m.font}</span>
    <span class="font-val">{m.fontValue}</span>
  </div>
</div>

<style>
  .tab-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .toggles {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-top: var(--space-1);
  }

  .toggle-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-3);
    font-size: var(--fs-sm);
  }

  .field-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-3);
    font-size: var(--fs-sm);
    color: var(--muted);
  }

  .select {
    height: 34px;
    padding: 0 var(--space-3);
    border-radius: var(--r-ctl);
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
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

  .font-val {
    font-size: var(--fs-sm);
    color: var(--faint);
  }
</style>
