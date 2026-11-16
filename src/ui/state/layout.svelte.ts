import { preferences } from './preferences.svelte';

/** Phones and narrow windows get the bottom dock instead of the rail. */
const DOCK_MAX_WIDTH = 760;
/** Below this width the rail starts collapsed unless the user chose otherwise. */
const AUTO_COLLAPSE_BELOW = 1200;

const dockQuery = matchMedia(`(max-width: ${String(DOCK_MAX_WIDTH)}px)`);
const narrowQuery = matchMedia(`(max-width: ${String(AUTO_COLLAPSE_BELOW - 1)}px)`);
let isDock = $state(dockQuery.matches);
let isNarrow = $state(narrowQuery.matches);
dockQuery.addEventListener('change', (event) => {
  isDock = event.matches;
});
narrowQuery.addEventListener('change', (event) => {
  isNarrow = event.matches;
});

const collapsed = $derived(!isDock && (preferences.value.railCollapsed ?? isNarrow));

export const layout = {
  get isDock(): boolean {
    return isDock;
  },
  get railCollapsed(): boolean {
    return collapsed;
  },
  toggleRail(): void {
    if (isDock) return;
    preferences.update({ railCollapsed: !collapsed });
  },
};
