export type ScrollTask = () => void;

export function createScrollScheduler(tasks: readonly ScrollTask[]): () => void {
  let frameRequested = false;

  function flush(): void {
    frameRequested = false;
    for (const task of tasks) task();
  }

  function requestFrame(): void {
    if (frameRequested) return;
    frameRequested = true;
    requestAnimationFrame(flush);
  }

  addEventListener('scroll', requestFrame, { passive: true });
  addEventListener('resize', requestFrame);

  return requestFrame;
}
