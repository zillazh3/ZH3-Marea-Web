<script lang="ts">
  import { lyricsKind } from '@/features/lyrics/model';
  import Badge from '../components/Badge.svelte';
  import Button from '../components/Button.svelte';
  import Empty from '../components/Empty.svelte';
  import ScreenHead from '../components/ScreenHead.svelte';
  import { i18n } from '../i18n.svelte';
  import { router } from '../router/router.svelte';
  import { session } from '../state/session.svelte';

  const m = $derived(i18n.m);
  const project = $derived(session.project);
  const kind = $derived(project ? lyricsKind(project.lyrics) : null);
</script>

<ScreenHead title={m.nav.editor} />

{#if project && kind}
  <div class="card summary">
    <h2>{project.title || m.editor.untitled}</h2>
    {#if project.artist}<p class="sub">{project.artist}</p>{/if}
    <p class="caption">{m.library.summary(project.lyrics.lines.length, kind)}</p>
    <div class="badge"><Badge {kind} label={m.search.kind[kind]} /></div>
    <p class="caption soon">{m.editor.soon}</p>
  </div>
{:else}
  <Empty title={m.editor.emptyTitle} hint={m.editor.emptyHint}>
    <Button
      onclick={() => {
        router.navigate('home');
      }}>{m.editor.goHome}</Button
    >
  </Empty>
{/if}

<style>
  .summary {
    padding: var(--space-5);
    max-width: 560px;
  }

  h2 {
    font-size: var(--fs-lg);
    font-weight: 600;
  }

  .sub {
    color: var(--muted);
  }

  .caption {
    font-size: var(--fs-xs);
    color: var(--faint);
  }

  .badge {
    margin-top: var(--space-3);
  }

  .soon {
    margin-top: var(--space-4);
  }
</style>
