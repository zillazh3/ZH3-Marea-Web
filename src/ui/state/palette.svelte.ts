let open = $state(false);

export const palette = {
  get open(): boolean {
    return open;
  },
  show(): void {
    open = true;
  },
  hide(): void {
    open = false;
  },
  toggle(): void {
    open = !open;
  },
};
