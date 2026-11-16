<script lang="ts">
  import Icon from '../icons/Icon.svelte';
  import { i18n } from '../i18n.svelte';
  import { layout } from '../state/layout.svelte';
  import { theme } from '../state/theme.svelte';
  import Logo from './Logo.svelte';
  import { tip } from './tooltip.svelte';

  const m = $derived(i18n.m.shell);
</script>

<div class="head" class:collapsed={layout.railCollapsed}>
  <button
    class="toggle"
    type="button"
    aria-label={layout.railCollapsed ? m.expandMenu : m.collapseMenu}
    aria-keyshortcuts="Control+B"
    onclick={() => {
      layout.toggleRail();
    }}
    {@attach tip(
      () => (layout.railCollapsed ? m.expandMenuTip : m.collapseMenuTip),
      () => true,
    )}
  >
    <Icon name="menu" />
  </button>
  <span class="logo"><Logo /></span>
  <span class="wordmark">{i18n.m.app.name}</span>
  <button
    class="theme"
    type="button"
    aria-label={theme.resolved === 'dark' ? m.switchToLight : m.switchToDark}
    onclick={() => {
      theme.toggle();
    }}
  >
    <Icon name={theme.resolved === 'dark' ? 'sun' : 'moon'} />
  </button>
</div>

<style>
  .head {
    display: grid;
    grid-template-columns: 56px 24px minmax(0, 1fr) 32px;
    align-items: center;
    gap: var(--space-2);
    height: var(--nav-h);
    margin-bottom: 6px;
  }

  .toggle,
  .theme {
    display: grid;
    place-items: center;
    color: var(--muted);
  }

  .toggle:hover,
  .theme:hover {
    background: var(--hover);
    color: var(--text);
  }

  .toggle {
    width: 40px;
    height: 40px;
    margin-left: var(--space-2);
    border-radius: var(--r-nav);
  }

  .theme {
    --icon-size: 18px;
    width: 32px;
    height: 32px;
    border-radius: var(--r-ctl);
  }

  .logo,
  .wordmark,
  .theme {
    transition: opacity var(--dur-label);
  }

  .wordmark {
    font-weight: 700;
    font-size: var(--fs-md);
    letter-spacing: -0.01em;
    white-space: nowrap;
    overflow: hidden;
  }

  .collapsed .logo,
  .collapsed .wordmark,
  .collapsed .theme {
    opacity: 0;
    pointer-events: none;
  }
</style>
