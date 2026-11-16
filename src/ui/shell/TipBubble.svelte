<script lang="ts">
  import { tooltip } from './tooltip.svelte';
</script>

<div
  class="tip"
  class:visible={tooltip.visible}
  style:left="{tooltip.x}px"
  style:top="{tooltip.y}px"
  aria-hidden="true"
>
  {tooltip.text}
</div>

<style>
  .tip {
    position: fixed;
    z-index: 60;
    padding: 5px 9px;
    border-radius: 8px;
    background: var(--pop-bg);
    border: 1px solid var(--border);
    font-size: var(--fs-xs);
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transform: translate(-4px, -50%);
    transition:
      opacity var(--dur-tip),
      transform var(--dur-tip);
  }

  .tip.visible {
    opacity: 1;
    transform: translate(0, -50%);
  }
</style>
