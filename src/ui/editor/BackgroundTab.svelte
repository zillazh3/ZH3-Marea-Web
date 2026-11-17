<script lang="ts">
  import type { ClipProject } from '@/features/projects/project';
  import Button from '../components/Button.svelte';
  import { pickFile } from '../files';
  import { i18n } from '../i18n.svelte';
  import type { EditorController } from './editorState.svelte';

  interface Props {
    editor: EditorController;
    project: ClipProject;
  }

  const { editor, project }: Props = $props();
  const m = $derived(i18n.m.editor.background);
  const style = $derived(editor.look.style);

  function setStyle(patch: Partial<typeof style>): void {
    editor.updateLook({ style: { ...style, ...patch } });
  }

  async function chooseCover(): Promise<void> {
    const file = await pickFile('image/png,image/jpeg,image/webp');
    if (!file) return;
    await editor.setCoverFile(file);
  }
</script>

<div class="tab-body">
  <label class="field">
    <span>{m.title}</span>
    <input
      type="text"
      class="input"
      value={project.title}
      oninput={(e) => {
        editor.updateMetadata(e.currentTarget.value, project.artist);
      }}
    />
  </label>

  <label class="field">
    <span>{m.artist}</span>
    <input
      type="text"
      class="input"
      value={project.artist}
      oninput={(e) => {
        editor.updateMetadata(project.title, e.currentTarget.value);
      }}
    />
  </label>

  <div class="cover-row">
    <span class="label">{m.cover}</span>
    <Button icon="image" onclick={() => void chooseCover()}>{m.chooseCover}</Button>
  </div>

  <label class="slider-row">
    <span>{m.bgBlur}</span>
    <input
      type="range"
      min="20"
      max="300"
      aria-label={m.bgBlur}
      value={Math.round(style.bgBlur * 100)}
      oninput={(e) => {
        setStyle({ bgBlur: Number(e.currentTarget.value) / 100 });
      }}
    />
    <output>{style.bgBlur.toFixed(1)}×</output>
  </label>

  <label class="slider-row">
    <span>{m.bgVeil}</span>
    <input
      type="range"
      min="0"
      max="80"
      aria-label={m.bgVeil}
      value={Math.round(style.bgVeil * 100)}
      oninput={(e) => {
        setStyle({ bgVeil: Number(e.currentTarget.value) / 100 });
      }}
    />
    <output>{Math.round(style.bgVeil * 100)}%</output>
  </label>

  <label class="slider-row">
    <span>{m.bgSat}</span>
    <input
      type="range"
      min="0"
      max="200"
      aria-label={m.bgSat}
      value={Math.round(style.bgSat * 100)}
      oninput={(e) => {
        setStyle({ bgSat: Number(e.currentTarget.value) / 100 });
      }}
    />
    <output>{Math.round(style.bgSat * 100)}%</output>
  </label>

  <label class="slider-row">
    <span>{m.bgSpeed}</span>
    <input
      type="range"
      min="0"
      max="300"
      aria-label={m.bgSpeed}
      value={Math.round(style.bgSpeed * 100)}
      oninput={(e) => {
        setStyle({ bgSpeed: Number(e.currentTarget.value) / 100 });
      }}
    />
    <output>{style.bgSpeed.toFixed(1)}×</output>
  </label>

  <p class="caption">{m.coverHint}</p>
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

  .cover-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-3);
  }

  .label {
    font-size: var(--fs-sm);
    color: var(--muted);
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
