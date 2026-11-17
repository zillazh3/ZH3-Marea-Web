<script lang="ts">
  import type { ExportJob } from '@/features/exports/queue';
  import { toneFor } from '@/features/storage/meta';
  import Button from '../components/Button.svelte';
  import Empty from '../components/Empty.svelte';
  import ScreenHead from '../components/ScreenHead.svelte';
  import { i18n } from '../i18n.svelte';
  import Cover from '../shell/Cover.svelte';
  import { exportQueue } from '../state/exportQueue.svelte';

  const m = $derived(i18n.m);
  let confirmingCancel = $state<string | null>(null);

  const hasFinished = $derived(
    exportQueue.jobs.some((job) => job.state.kind !== 'queued' && job.state.kind !== 'rendering'),
  );
  const showEmpty = $derived(exportQueue.loaded && exportQueue.jobs.length === 0);

  function formatEta(seconds: number | null): string {
    if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '';
    const total = Math.ceil(seconds);
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return m.exports.eta(`${String(mins)}:${String(secs).padStart(2, '0')}`);
  }

  function formatBytes(bytes: number | undefined): string {
    if (!bytes || bytes <= 0) return '';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    const kb = Math.max(1, Math.round(bytes / 1024));
    return `${String(kb)} KB`;
  }

  function stateText(job: ExportJob): string {
    const s = job.state;
    if (s.kind === 'queued') return m.exports.states.queued;
    if (s.kind === 'rendering') {
      const pct = Math.min(100, Math.max(0, Math.round(s.progress * 100)));
      return m.exports.states.rendering(pct, formatEta(s.etaSeconds));
    }
    if (s.kind === 'done') return m.exports.states.done;
    if (s.kind === 'cancelled') return m.exports.states.cancelled;
    return s.message || m.exports.states.failed;
  }

  function subtitleText(job: ExportJob): string {
    const parts = [stateText(job)];
    if (job.label) parts.push(job.label);
    const size = formatBytes(job.sizeBytes);
    if (job.state.kind === 'done' && size) parts.push(size);
    return parts.join(' · ');
  }

  function barPct(job: ExportJob): number {
    if (job.state.kind === 'done') return 100;
    if (job.state.kind === 'rendering') {
      return Math.min(100, Math.max(0, Math.round(job.state.progress * 1000) / 10));
    }
    return 0;
  }
</script>

<ScreenHead title={m.nav.exports}>
  {#if exportQueue.jobs.length > 0}
    <Button
      disabled={!hasFinished}
      onclick={() => {
        void exportQueue.clearFinished();
      }}
    >
      {m.exports.clearFinished}
    </Button>
  {/if}
</ScreenHead>

{#if showEmpty}
  <Empty title={m.exports.emptyTitle} hint={m.exports.emptyHint} />
{:else}
  <div class="queue">
    {#each exportQueue.jobs as job (job.id)}
      {@const s = job.state}
      <div class="card job" class:done={s.kind === 'done'} class:failed={s.kind === 'failed'}>
        <div class="mini">
          {#if job.thumbUrl}
            <img src={job.thumbUrl} alt="" />
          {:else}
            <div class="cover-wrap"><Cover tone={toneFor(job.title, job.artist)} /></div>
          {/if}
        </div>

        <div class="mid">
          <div class="title">
            {job.artist
              ? `${job.artist} – ${job.title || m.editor.untitled}`
              : job.title || m.editor.untitled}
          </div>
          <div class="sub">{subtitleText(job)}</div>
          {#if s.kind === 'queued' || s.kind === 'rendering' || s.kind === 'done'}
            <div class="bar" aria-hidden="true">
              <i style:width={`${String(barPct(job))}%`}></i>
            </div>
          {/if}
        </div>

        <div class="acts">
          {#if s.kind === 'queued'}
            <Button
              onclick={() => {
                exportQueue.cancel(job.id);
              }}
            >
              {m.exports.cancel}
            </Button>
          {:else if s.kind === 'rendering'}
            <Button
              onclick={() => {
                if (confirmingCancel === job.id) {
                  confirmingCancel = null;
                  exportQueue.cancel(job.id);
                } else {
                  confirmingCancel = job.id;
                }
              }}
              onblur={() => {
                if (confirmingCancel === job.id) confirmingCancel = null;
              }}
            >
              {confirmingCancel === job.id ? m.exports.confirmCancel : m.exports.cancel}
            </Button>
          {:else if s.kind === 'done'}
            <Button
              variant="primary"
              icon="download"
              onclick={() => {
                void exportQueue.download(job.id);
              }}
            >
              {m.exports.download}
            </Button>
            {#if exportQueue.canShare()}
              <Button
                icon="share-2"
                onclick={() => {
                  void exportQueue.share(job.id);
                }}
              >
                {m.exports.share}
              </Button>
            {/if}
            <Button
              onclick={() => {
                void exportQueue.remove(job.id);
              }}
            >
              {m.exports.remove}
            </Button>
          {:else}
            <Button
              onclick={() => {
                void exportQueue.remove(job.id);
              }}
            >
              {m.exports.remove}
            </Button>
          {/if}
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .queue {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 920px;
  }

  .job {
    display: grid;
    grid-template-columns: 44px 1fr auto;
    gap: var(--space-4);
    align-items: center;
    padding: var(--space-3) var(--space-4);
  }

  .mini {
    width: 44px;
    height: 78px;
    border-radius: var(--r-ctl);
    position: relative;
    overflow: hidden;
    background: var(--surface-2);
  }

  .mini img,
  .cover-wrap {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .mid {
    min-width: 0;
  }

  .title {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sub {
    font-size: var(--fs-sm);
    color: var(--muted);
    overflow-wrap: anywhere;
  }

  .job.failed .sub {
    color: var(--danger);
  }

  .bar {
    height: 6px;
    border-radius: var(--r-pill);
    background: var(--surface-2);
    margin-top: 10px;
    overflow: hidden;
    max-width: 420px;
  }

  .bar i {
    display: block;
    height: 100%;
    background: var(--grad);
    border-radius: var(--r-pill);
    transition: width 0.3s linear;
  }

  .job.done .bar i {
    background: var(--ok);
  }

  .acts {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  @media (max-width: 760px) {
    .job {
      grid-template-columns: 44px 1fr;
    }

    .acts {
      grid-column: 1 / -1;
    }
  }
</style>
