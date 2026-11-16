<script lang="ts">
  interface Props {
    /** 0..1, or null to hide the ring. */
    progress: number | null;
  }

  const { progress }: Props = $props();

  const RADIUS = 13;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
</script>

{#if progress !== null}
  <svg class="ring" viewBox="0 0 30 30" aria-hidden="true">
    <circle class="track" cx="15" cy="15" r={RADIUS} />
    <circle
      class="bar"
      cx="15"
      cy="15"
      r={RADIUS}
      stroke-dasharray={CIRCUMFERENCE}
      stroke-dashoffset={CIRCUMFERENCE * (1 - progress)}
    />
  </svg>
{/if}

<style>
  .ring {
    position: absolute;
    inset: 0;
    width: var(--ring-size);
    height: var(--ring-size);
    transform: rotate(-90deg);
  }

  circle {
    fill: none;
    stroke-width: 2;
  }

  .track {
    stroke: var(--border);
  }

  .bar {
    stroke: url(#gradient-brand);
    stroke-linecap: round;
    transition: stroke-dashoffset 0.3s linear;
  }
</style>
