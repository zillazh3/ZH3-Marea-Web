import { planInterlude } from './interlude';
import { Dot, Item, buildWords } from './items';
import type { Interlude, Line } from './lyrics';
import { pick } from './motion';
import { TUNING } from './tuning';

/** Shortest interlude the full animation is planned for (enter + fill + 1 s exit). */
const MIN_PLAN_MS = 1910;
/** Delay before the dots of a gap between lines appear; the intro shows them at once. */
const GAP_DELAY_MS = 500;

export function buildGap(index: number, src: Interlude): Item {
  const item = new Item('gap', index, null, src.start / 1000, src.end / 1000);
  item.dots = [new Dot(), new Dot(), new Dot()];
  // The next line activates early and the interlude collapses then: the plan must end there or the dots get cut mid-exit.
  const total = (item.end - item.start - TUNING.anticipationS) * 1000;
  const planMs = index === 0 ? Math.max(total, MIN_PLAN_MS) : total;
  item.speed = total > 0 ? planMs / total : 1; // a short intro plays its full animation faster so it fits
  item.plan = planInterlude(planMs, index === 0 ? 0 : GAP_DELAY_MS);
  return item;
}

export function buildLine(index: number, src: Line): Item {
  const item = new Item('line', index, src, src.start / 1000, src.end / 1000);
  item.duet = src.agent === 'v2';
  item.approx = src.approx;
  item.motion = pick(src);
  item.words = buildWords(src.syllables, false, index, src.approx);
  for (const bg of src.bg) item.words.push(...buildWords(bg.syllables, true, index, src.approx));
  return item;
}
