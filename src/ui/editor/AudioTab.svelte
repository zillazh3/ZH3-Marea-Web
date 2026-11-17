<script lang="ts">
  import { LOCAL_OFFSET_RANGE, waveformPeaks } from '@/features/audio/local';
  import { clipRangeMs, type AudioSourceMode } from '@/features/projects/editorLook';
  import type { ClipProject } from '@/features/projects/project';
  import Button from '../components/Button.svelte';
  import Segmented from '../components/Segmented.svelte';
  import { pickFile } from '../files';
  import { i18n } from '../i18n.svelte';
  import { theme } from '../state/theme.svelte';
  import { formatTimecode, type EditorController } from './editorState.svelte';

  interface Props {
    editor: EditorController;
    project: ClipProject;
  }

  const WAVE_PAD_MS = 1500;
  const WAVE_H = 88;
  const WAVE_W = 360;
  const { editor, project }: Props = $props();
  const m = $derived(i18n.m.editor.audio);

  let waveCanvas: HTMLCanvasElement | undefined = $state();
  let localOffsetMs = $derived(project.audioOffsetMs);

  const sourceOptions = $derived<readonly { value: AudioSourceMode; label: string }[]>([
    { value: 'solo', label: m.solo },
    { value: 'local', label: m.local },
  ]);

  async function chooseAudio(): Promise<void> {
    const file = await pickFile('audio/*,.mp3,.wav,.flac,.m4a,.aac,.ogg,.opus');
    if (!file) return;
    await editor.setAudioFile(file);
  }

  function formatSignedMs(ms: number): string {
    const rounded = Math.round(ms);
    return `${rounded >= 0 ? `+${String(rounded)}` : String(rounded)} ms`;
  }

  $effect(() => {
    // Subscribe to reactive dependencies before drawing waveform.
    const audio = editor.audio;
    const offset = localOffsetMs;
    const first = editor.first;
    const last = editor.last;
    const activeTheme = theme.resolved;

    const canvas = waveCanvas;
    if (!canvas || editor.audioSource !== 'local') return;
    canvas.dataset.theme = activeTheme;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const styles = getComputedStyle(canvas);
    const colSurface = styles.getPropertyValue('--surface').trim();
    const colPill = styles.getPropertyValue('--pill').trim();
    const colAccent = styles.getPropertyValue('--accent').trim();
    const colActiveBar = styles.getPropertyValue('--accent-icon').trim();
    const colMuted = styles.getPropertyValue('--muted').trim();

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = colSurface;
    ctx.fillRect(0, 0, w, h);
    if (!audio) return;

    const [startMs, endMs] = clipRangeMs(project, first, last);
    const viewStart = Math.max(0, startMs - WAVE_PAD_MS);
    const viewEnd = endMs + WAVE_PAD_MS;
    const span = Math.max(1, viewEnd - viewStart);
    const toX = (ms: number): number => ((ms - viewStart) / span) * w;

    const x0 = Math.max(0, toX(startMs));
    const x1 = Math.min(w, toX(endMs));
    ctx.fillStyle = colPill;
    ctx.fillRect(x0, 0, Math.max(0, x1 - x0), h);

    ctx.strokeStyle = colAccent;
    ctx.lineWidth = 1;
    for (const line of project.lyrics.lines) {
      if (line.start >= viewStart && line.start <= viewEnd) {
        const lx = Math.round(toX(line.start)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(lx, 0);
        ctx.lineTo(lx, h);
        ctx.stroke();
      }
    }

    const bins = Math.max(24, Math.floor(w / 3));
    const peaks = waveformPeaks(audio, viewStart, viewEnd, offset, bins);
    const step = w / bins;
    const mid = h / 2;
    const half = h / 2 - 8;
    const barW = Math.max(1.5, step * 0.68);
    for (let i = 0; i < peaks.length; i += 1) {
      const cx = i * step + step / 2;
      const v = peaks[i] ?? 0;
      const barH = Math.max(2, v * half * 2);
      ctx.fillStyle = cx >= x0 && cx <= x1 ? colActiveBar : colMuted;
      ctx.fillRect(cx - barW / 2, mid - barH / 2, barW, barH);
    }
  });
</script>

<div class="tab-body">
  <Segmented
    label={m.sourceLabel}
    value={editor.audioSource}
    options={sourceOptions}
    onchange={(mode: AudioSourceMode) => {
      editor.setAudioSource(mode);
    }}
  />

  {#if editor.audioSource === 'solo'}
    <p class="caption">{m.soloHint}</p>
  {:else}
    <div class="file-row">
      <Button icon="music" disabled={editor.audioLoading} onclick={() => void chooseAudio()}>
        {m.chooseFile}
      </Button>
      <span class="file-name">
        {#if editor.audioLoading}
          {m.loading}
        {:else if editor.audio}
          {m.fileSummary(editor.audio.fileName, formatTimecode(editor.audio.durationMs))}
        {:else if editor.audioMissing && project.audioPath}
          {m.missingFile(project.audioPath)}
        {:else}
          {m.noFile}
        {/if}
      </span>
    </div>

    <canvas
      bind:this={waveCanvas}
      class="wave"
      width={WAVE_W}
      height={WAVE_H}
      aria-label={m.waveformLabel}
    ></canvas>

    <label class="slider-row">
      <span>{m.offset}</span>
      <input
        type="range"
        min={LOCAL_OFFSET_RANGE[0]}
        max={LOCAL_OFFSET_RANGE[1]}
        step="10"
        aria-label={m.offset}
        value={Math.round(localOffsetMs)}
        oninput={(e) => {
          const val = Number(e.currentTarget.value);
          localOffsetMs = val;
          editor.setAudioOffset(val);
        }}
      />
      <output>{formatSignedMs(localOffsetMs)}</output>
    </label>

    <p class="caption">{m.offsetHint}</p>
  {/if}
</div>

<style>
  .tab-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .file-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .file-name {
    font-size: var(--fs-xs);
    color: var(--muted);
    min-width: 0;
    word-break: break-word;
  }

  .wave {
    width: 100%;
    height: 88px;
    border-radius: var(--r-ctl);
    border: 1px solid var(--border);
    display: block;
  }

  .slider-row {
    display: grid;
    grid-template-columns: 72px 1fr 72px;
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
