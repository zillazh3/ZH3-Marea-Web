<script lang="ts"></script>

<div class="ambient" aria-hidden="true"></div>

<style>
  .ambient {
    position: fixed;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    background:
      radial-gradient(
        60vmax 50vmax at 85% -10%,
        color-mix(in srgb, var(--accent-2) 22%, transparent),
        transparent
      ),
      radial-gradient(
        50vmax 45vmax at 10% 110%,
        color-mix(in srgb, var(--accent) 18%, transparent),
        transparent
      );
    transition: opacity var(--dur-ambient);
  }
</style>
