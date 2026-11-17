// Synchronous SHA-1 and SplitMix64 helpers matching Python hashlib.sha1 + BigInt wordfx seeds.

const K0 = 0x5a827999;
const K1 = 0x6ed9eba1;
const K2 = 0x8f1bbcdc;
const K3 = 0xca62c1d6;

function rotl32(n: number, bits: number): number {
  return ((n << bits) | (n >>> (32 - bits))) >>> 0;
}

/** Computes raw 20-byte SHA-1 digest of UTF-8 `text`. */
export function sha1Bytes(text: string): Uint8Array {
  const input = new TextEncoder().encode(text);
  const bitLen = input.length * 8;
  const padLen = ((input.length + 8) >> 6) + 1;
  const blocks = new Uint32Array(padLen * 16);

  for (let i = 0; i < input.length; i += 1) {
    const wordIdx = i >> 2;
    blocks[wordIdx] = (blocks[wordIdx] ?? 0) | ((input[i] ?? 0) << (24 - (i & 3) * 8));
  }
  const termIdx = input.length >> 2;
  blocks[termIdx] = (blocks[termIdx] ?? 0) | (0x80 << (24 - (input.length & 3) * 8));
  blocks[blocks.length - 2] = Math.floor(bitLen / 0x1_0000_0000);
  blocks[blocks.length - 1] = bitLen >>> 0;

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);

  for (let i = 0; i < blocks.length; i += 16) {
    for (let j = 0; j < 16; j += 1) w[j] = blocks[i + j] ?? 0;
    for (let j = 16; j < 80; j += 1) {
      w[j] = rotl32((w[j - 3] ?? 0) ^ (w[j - 8] ?? 0) ^ (w[j - 14] ?? 0) ^ (w[j - 16] ?? 0), 1);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let j = 0; j < 80; j += 1) {
      let f: number;
      let k: number;
      if (j < 20) {
        f = ((b & c) | (~b & d)) >>> 0;
        k = K0;
      } else if (j < 40) {
        f = (b ^ c ^ d) >>> 0;
        k = K1;
      } else if (j < 60) {
        f = ((b & c) | (b & d) | (c & d)) >>> 0;
        k = K2;
      } else {
        f = (b ^ c ^ d) >>> 0;
        k = K3;
      }
      const temp = (rotl32(a, 5) + f + e + k + (w[j] ?? 0)) >>> 0;
      e = d;
      d = c;
      c = rotl32(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const out = new Uint8Array(20);
  const view = new DataView(out.buffer);
  view.setUint32(0, h0, false);
  view.setUint32(4, h1, false);
  view.setUint32(8, h2, false);
  view.setUint32(12, h3, false);
  view.setUint32(16, h4, false);
  return out;
}

export function sha1Hex(text: string): string {
  const bytes = sha1Bytes(text);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

export function sha1Uint64(text: string): bigint {
  const bytes = sha1Bytes(text);
  const view = new DataView(bytes.buffer);
  return view.getBigUint64(0, false);
}

export function sha1Uint32(text: string): number {
  const bytes = sha1Bytes(text);
  const view = new DataView(bytes.buffer);
  return view.getUint32(0, false);
}

const MASK64 = 0xffff_ffff_ffff_ffffn;

/** Deterministic SplitMix64 PRNG step over unsigned 64-bit state, returning next state and `[0, 1)` unit float. */
export function splitmix64(state: bigint): { state: bigint; unit: number } {
  const next = (state + 0x9e37_79b9_7f4a_7c15n) & MASK64;
  let z = next;
  z = ((z ^ (z >> 30n)) * 0xbf58_476d_1ce4_e5b9n) & MASK64;
  z = ((z ^ (z >> 27n)) * 0x94d0_49bb_1331_11ebn) & MASK64;
  z = (z ^ (z >> 31n)) & MASK64;
  const top53 = z >> 11n;
  return { state: next, unit: Number(top53) / 9007199254740992 };
}
