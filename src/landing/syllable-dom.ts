import type { ClipLineSpec, ClipSyllableEvaluation } from './clip-math';

export interface MountedSyllableDom {
  readonly span: HTMLSpanElement;
  lastKey: string;
}

const GLOW_ACTIVE_THRESHOLD = 0.01;

export function mountLineSyllables(
  container: HTMLElement,
  spec: ClipLineSpec,
  className: string,
): MountedSyllableDom[] {
  container.textContent = '';
  const mounted: MountedSyllableDom[] = [];

  spec.words.forEach((wordSpec, wordPosition) => {
    const wordElement = document.createElement('b');
    for (const syllableIndex of wordSpec.syllableIndices) {
      const timing = spec.syllables[syllableIndex];
      if (!timing) continue;
      const span = document.createElement('span');
      span.className = className;
      span.textContent = timing.text;
      if (timing.effect) span.dataset.fx = timing.effect;
      wordElement.append(span);
      mounted.push({ span, lastKey: '' });
    }
    container.append(wordElement, wordPosition < spec.words.length - 1 ? ' ' : '');
  });

  return mounted;
}

export function applySyllableEvaluation(
  dom: MountedSyllableDom,
  evaluation: ClipSyllableEvaluation,
  glowProperty = '--glow',
): void {
  const progress = evaluation.progress.toFixed(3);
  const lift = `${evaluation.liftEm.toFixed(3)}em`;
  const scale = evaluation.scale.toFixed(3);
  const glow = evaluation.glow.toFixed(2);
  const key = `${progress}|${lift}|${scale}|${glow}|${evaluation.state}`;
  if (dom.lastKey === key) return;
  dom.lastKey = key;

  dom.span.style.setProperty('--progress', progress);
  dom.span.style.setProperty('--lift', lift);
  dom.span.style.setProperty('--syl-scale', scale);
  dom.span.style.setProperty(glowProperty, glow);
  dom.span.dataset.state = evaluation.state;
  dom.span.toggleAttribute('data-glowing', evaluation.glow > GLOW_ACTIVE_THRESHOLD);
}
