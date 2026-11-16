import type { Attachment } from 'svelte/attachments';

const GAP_PX = 12;

let state = $state({ text: '', x: 0, y: 0, visible: false });

export const tooltip = {
  get text(): string {
    return state.text;
  },
  get x(): number {
    return state.x;
  },
  get y(): number {
    return state.y;
  },
  get visible(): boolean {
    return state.visible;
  },
};

/**
 * Shows a tooltip to the right of the element on hover and keyboard focus. The rail collapses to icons, so this is
 * the only place their names are visible; `enabled` lets the caller limit it to that state.
 */
export function tip(text: () => string, enabled: () => boolean): Attachment<HTMLElement> {
  return (node) => {
    const show = (): void => {
      if (!enabled()) return;
      const box = node.getBoundingClientRect();
      state = { text: text(), x: box.right + GAP_PX, y: box.top + box.height / 2, visible: true };
    };
    const hide = (): void => {
      state = { ...state, visible: false };
    };
    const onFocus = (): void => {
      if (node.matches(':focus-visible')) show();
    };
    node.addEventListener('pointerenter', show);
    node.addEventListener('pointerleave', hide);
    node.addEventListener('focus', onFocus);
    node.addEventListener('blur', hide);
    return () => {
      node.removeEventListener('pointerenter', show);
      node.removeEventListener('pointerleave', hide);
      node.removeEventListener('focus', onFocus);
      node.removeEventListener('blur', hide);
      hide();
    };
  };
}
