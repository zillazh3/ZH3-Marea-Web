<script lang="ts">
  interface Props {
    /** Index into the placeholder cover palettes in tokens.css. */
    tone: number;
  }

  const { tone }: Props = $props();
</script>

<div
  class="cover"
  style:--c1={`var(--cover-${String(tone)}-c1)`}
  style:--c2={`var(--cover-${String(tone)}-c2)`}
  style:--c3={`var(--cover-${String(tone)}-c3)`}
></div>

<style>
  .cover {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background:
      radial-gradient(circle at 28% 25%, var(--c3) 0, transparent 55%),
      linear-gradient(140deg, var(--c1), var(--c2));
  }

  .cover::after {
    content: '';
    position: absolute;
    inset: 0;
    background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Cpath d='M10 70c10 0 10-12 20-12s10 12 20 12 10-12 20-12 10 12 20 12 10-12 20-12' fill='none' stroke='white' stroke-opacity='.45' stroke-width='5' stroke-linecap='round'/%3E%3Cpath d='M10 88c10 0 10-8 20-8s10 8 20 8 10-8 20-8 10 8 20 8 10-8 20-8' fill='none' stroke='white' stroke-opacity='.22' stroke-width='3' stroke-linecap='round'/%3E%3C/svg%3E")
      center / cover;
  }
</style>
