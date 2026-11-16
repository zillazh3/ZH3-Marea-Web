// Python semantics the desktop engine relies on and JavaScript does not share. Each helper is tested against values
// produced by Python itself (tests/fixtures/engine/pycompat.json).

/** Python's `round(x)`: ties go to the even integer (JavaScript's `Math.round` rounds them up). */
export function pyRound(x: number): number {
  const floor = Math.floor(x);
  const diff = x - floor;
  const rounded = diff < 0.5 ? floor : diff > 0.5 ? floor + 1 : floor % 2 === 0 ? floor : floor + 1;
  return rounded + 0; // Python has no negative zero for ints
}

/** Python's `a % b`: the result takes the sign of the divisor (JavaScript's takes the dividend's). */
export function pyMod(a: number, b: number): number {
  const r = a % b;
  return r !== 0 && r < 0 !== b < 0 ? r + b : r;
}

const CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** `zlib.crc32(text.encode())`: unsigned CRC-32 of the UTF-8 bytes. */
export function crc32Utf8(text: string): number {
  let crc = 0xffffffff;
  for (const byte of new TextEncoder().encode(text)) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Python's `len(text)`: code points, not UTF-16 units. */
export function codePointLength(text: string): number {
  return Array.from(text).length;
}

/** Python's `str.isalnum()` on one character: letters (any script) and numerics (decimal, digit, numeric). */
export function isAlnum(char: string): boolean {
  return /^[\p{L}\p{N}]+$/u.test(char);
}

/** `statistics.median`: the middle value, or the mean of the two middle values. */
export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const hi = sorted[mid];
  const lo = sorted[mid - 1];
  if (hi === undefined) throw new RangeError('median of an empty list');
  return sorted.length % 2 === 1 || lo === undefined ? hi : (lo + hi) / 2;
}

/**
 * The vibrato phase hash of the desktop engine. The products overflow 32 bits, so the XOR must run on BigInt; plain
 * `^` would truncate each operand to int32 and give a different phase.
 */
export function vibratoPhase(line: number, word: number, letter: number): number {
  const mixed =
    (BigInt(line) * 73856093n) ^ (BigInt(word) * 19349663n) ^ (BigInt(letter) * 83492791n);
  return (Number(mixed % 1000n) / 1000) * 6.28;
}
