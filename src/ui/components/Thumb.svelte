<script lang="ts">
  import Cover from '../shell/Cover.svelte';

  interface Props {
    tone: number;
    /** The line before the sung one, the sung one, and the next. */
    lines: readonly string[];
  }

  const { tone, lines }: Props = $props();
</script>

<span class="thumb">
  <span class="bg"><Cover {tone} /></span>
  <span class="veil"></span>
  <span class="lines">
    <span>{lines[0] ?? ''}</span>
    <b>{lines[1] ?? ''}</b>
    <span>{lines[2] ?? ''}</span>
  </span>
</span>

<style>
  .thumb {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 9 / 16;
    border-radius: var(--r-ctl);
    overflow: hidden;
  }

  .bg {
    position: absolute;
    inset: -20%;
    filter: blur(14px) saturate(120%);
    opacity: 0.85;
  }

  .veil {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, var(--thumb-veil-top), var(--thumb-veil-bottom));
  }

  .lines {
    position: absolute;
    left: 9px;
    right: 9px;
    top: 32%;
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-weight: 700;
    font-size: 8.5px;
    line-height: 1.15;
    color: var(--thumb-text);
  }

  .lines b {
    color: var(--thumb-text-active);
    font-size: 10px;
  }
</style>
