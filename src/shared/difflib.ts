// Port of Python `difflib.SequenceMatcher` with `autojunk = false` for deterministic string similarity.

export interface MatchBlock {
  readonly a: number;
  readonly b: number;
  readonly size: number;
}

function calculateRatio(matches: number, length: number): number {
  return length > 0 ? (2.0 * matches) / length : 1.0;
}

export class SequenceMatcher {
  private readonly a: readonly string[];
  private readonly b: readonly string[];
  private readonly b2j = new Map<string, number[]>();
  private fullbcount: Map<string, number> | null = null;
  private matchingBlocksCache: MatchBlock[] | null = null;

  constructor(aStr: string, bStr: string) {
    this.a = Array.from(aStr);
    this.b = Array.from(bStr);
    this.chainB();
  }

  private chainB(): void {
    this.b2j.clear();
    for (let i = 0; i < this.b.length; i += 1) {
      const elt = this.b[i] ?? '';
      let indices = this.b2j.get(elt);
      if (!indices) {
        indices = [];
        this.b2j.set(elt, indices);
      }
      indices.push(i);
    }
  }

  findLongestMatch(alo = 0, ahi = this.a.length, blo = 0, bhi = this.b.length): MatchBlock {
    let bestI = alo;
    let bestJ = blo;
    let bestSize = 0;
    let j2len = new Map<number, number>();

    for (let i = alo; i < ahi; i += 1) {
      const newj2len = new Map<number, number>();
      const elt = this.a[i] ?? '';
      const indices = this.b2j.get(elt) ?? [];
      for (const j of indices) {
        if (j < blo) continue;
        if (j >= bhi) break;
        const k = (j2len.get(j - 1) ?? 0) + 1;
        newj2len.set(j, k);
        if (k > bestSize) {
          bestI = i - k + 1;
          bestJ = j - k + 1;
          bestSize = k;
        }
      }
      j2len = newj2len;
    }

    while (bestI > alo && bestJ > blo && this.a[bestI - 1] === this.b[bestJ - 1]) {
      bestI -= 1;
      bestJ -= 1;
      bestSize += 1;
    }
    while (
      bestI + bestSize < ahi &&
      bestJ + bestSize < bhi &&
      this.a[bestI + bestSize] === this.b[bestJ + bestSize]
    ) {
      bestSize += 1;
    }

    return { a: bestI, b: bestJ, size: bestSize };
  }

  getMatchingBlocks(): MatchBlock[] {
    if (this.matchingBlocksCache !== null) return this.matchingBlocksCache;
    const la = this.a.length;
    const lb = this.b.length;
    const queue: [number, number, number, number][] = [[0, la, 0, lb]];
    const matchingBlocks: MatchBlock[] = [];

    while (queue.length > 0) {
      const popped = queue.pop();
      if (!popped) break;
      const [alo, ahi, blo, bhi] = popped;
      const x = this.findLongestMatch(alo, ahi, blo, bhi);
      if (x.size > 0) {
        matchingBlocks.push(x);
        if (alo < x.a && blo < x.b) queue.push([alo, x.a, blo, x.b]);
        if (x.a + x.size < ahi && x.b + x.size < bhi) {
          queue.push([x.a + x.size, ahi, x.b + x.size, bhi]);
        }
      }
    }

    matchingBlocks.sort((m1, m2) => m1.a - m2.a || m1.b - m2.b || m1.size - m2.size);

    let i1 = 0;
    let j1 = 0;
    let k1 = 0;
    const nonAdjacent: MatchBlock[] = [];
    for (const block of matchingBlocks) {
      if (i1 + k1 === block.a && j1 + k1 === block.b) {
        k1 += block.size;
      } else {
        if (k1 > 0) nonAdjacent.push({ a: i1, b: j1, size: k1 });
        i1 = block.a;
        j1 = block.b;
        k1 = block.size;
      }
    }
    if (k1 > 0) nonAdjacent.push({ a: i1, b: j1, size: k1 });
    nonAdjacent.push({ a: la, b: lb, size: 0 });
    this.matchingBlocksCache = nonAdjacent;
    return nonAdjacent;
  }

  ratio(): number {
    let matches = 0;
    for (const b of this.getMatchingBlocks()) matches += b.size;
    return calculateRatio(matches, this.a.length + this.b.length);
  }

  quickRatio(): number {
    if (this.fullbcount === null) {
      const counts = new Map<string, number>();
      for (const elt of this.b) counts.set(elt, (counts.get(elt) ?? 0) + 1);
      this.fullbcount = counts;
    }
    const avail = new Map<string, number>();
    let matches = 0;
    for (const elt of this.a) {
      const numb = avail.get(elt) ?? this.fullbcount.get(elt) ?? 0;
      avail.set(elt, numb - 1);
      if (numb > 0) matches += 1;
    }
    return calculateRatio(matches, this.a.length + this.b.length);
  }

  realQuickRatio(): number {
    return calculateRatio(Math.min(this.a.length, this.b.length), this.a.length + this.b.length);
  }
}
