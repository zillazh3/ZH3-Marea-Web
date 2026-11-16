<script lang="ts">
  import { ICONS, type IconName } from './icons';

  interface Props {
    name: IconName;
  }

  const { name }: Props = $props();
</script>

<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
  {#each ICONS[name] as shape, index (index)}
    {#if shape.kind === 'path'}
      <path d={shape.d} />
    {:else if shape.kind === 'circle'}
      <circle cx={shape.cx} cy={shape.cy} r={shape.r} />
    {:else if shape.kind === 'rect'}
      <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx} />
    {:else if shape.kind === 'polygon'}
      <polygon points={shape.points} />
    {:else}
      <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} />
    {/if}
  {/each}
</svg>

<style>
  .icon {
    width: var(--icon-size, 20px);
    height: var(--icon-size, 20px);
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
    stroke-linejoin: round;
    flex: none;
  }
</style>
