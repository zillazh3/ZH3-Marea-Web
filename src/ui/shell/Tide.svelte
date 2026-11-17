<script lang="ts">
  import { untrack } from 'svelte';
  import { router } from '../router/router.svelte';
  import { layout } from '../state/layout.svelte';

  interface Props {
    /** The rail the indicator lives in; the active item is found inside it. */
    rail: HTMLElement | undefined;
  }

  const { rail }: Props = $props();

  let box = $state({ x: 0, y: 0, width: 0, height: 0, visible: false });
  // The first placement must not slide in from the corner.
  let animated = $state(false);

  function place(): void {
    const target = rail?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!rail || !target?.offsetParent) {
      box = { ...box, visible: false };
      return;
    }
    const railBox = rail.getBoundingClientRect();
    const targetBox = target.getBoundingClientRect();
    box = {
      x: targetBox.left - railBox.left - rail.clientLeft,
      y: targetBox.top - railBox.top - rail.clientTop,
      width: targetBox.width,
      height: targetBox.height,
      visible: true,
    };
  }

  const placementKey = $derived(
    `${String(router.callbackActive)}:${router.current}:${String(layout.railCollapsed)}:${String(layout.isDock)}`,
  );

  // Re-measure whenever the active item or the rail geometry changes.
  $effect(() => {
    // `place` writes `box`: untracked, so the effect does not re-run on its own write (it looped on the Spotify callback screen,
    // which has no current item). `rail` is read here because the first run happens before it is bound.
    if (placementKey && rail) untrack(place);
    if (!animated) requestAnimationFrame(() => (animated = true));
  });

  $effect(() => {
    if (!rail) return;
    const observer = new ResizeObserver(place);
    observer.observe(rail);
    const onTransitionEnd = (event: TransitionEvent): void => {
      if (event.propertyName === 'width') place();
    };
    rail.addEventListener('transitionend', onTransitionEnd);
    return () => {
      observer.disconnect();
      rail.removeEventListener('transitionend', onTransitionEnd);
    };
  });
</script>

<div
  class="tide"
  class:animated
  class:dock={layout.isDock}
  style:transform="translate({box.x}px, {box.y}px)"
  style:width="{box.width}px"
  style:height="{box.height}px"
  style:opacity={box.visible ? 1 : 0}
  aria-hidden="true"
>
  {#key router.current}
    <div class="wave">
      <svg viewBox="0 0 52 6" preserveAspectRatio="none">
        <path
          d="M0 3c3.25 0 3.25-2.2 6.5-2.2S9.75 3 13 3s3.25-2.2 6.5-2.2S22.75 3 26 3s3.25-2.2 6.5-2.2S35.75 3 39 3s3.25-2.2 6.5-2.2S48.75 3 52 3"
        />
      </svg>
    </div>
  {/key}
</div>

<style>
  .tide {
    position: absolute;
    z-index: 0;
    left: 0;
    top: 0;
    border-radius: var(--r-nav);
    background: var(--pill);
    pointer-events: none;
  }

  .tide.animated {
    transition:
      transform var(--dur-tide) var(--ease-tide),
      width var(--dur-rail) var(--ease),
      height var(--dur-rail) var(--ease),
      opacity var(--dur-ui);
  }

  .wave {
    position: absolute;
    left: calc(28px - 13px);
    bottom: 4px;
    width: 26px;
    height: 6px;
    overflow: hidden;
    animation: surge var(--dur-surge) var(--ease);
  }

  .dock .wave {
    left: calc(50% - 13px);
    bottom: 2px;
  }

  .wave svg {
    display: block;
    width: 52px;
    height: 6px;
    animation: flow var(--dur-wave) linear infinite;
  }

  .wave path {
    fill: none;
    stroke: url(#gradient-wave);
    stroke-width: 2;
    stroke-linecap: round;
  }

  @keyframes flow {
    to {
      transform: translateX(-13px);
    }
  }

  @keyframes surge {
    40% {
      transform: scaleY(1.9);
    }
  }
</style>
