import { describe, expect, it } from 'vitest';
import { isCoverSizeAllowed, readImageSize } from './imageSize';

function png(width: number, height: number): Uint8Array {
  const out = new Uint8Array(33);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(out.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return out;
}

/** SOI, an APP0 segment to skip, then SOF0. */
function jpeg(width: number, height: number, sof = 0xc0): Uint8Array {
  const out = new Uint8Array(2 + 6 + 19);
  out.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, 0xff, sof, 0x00, 0x11, 0x08]);
  const view = new DataView(out.buffer);
  view.setUint16(13, height);
  view.setUint16(15, width);
  return out;
}

describe('readImageSize', () => {
  it('reads PNG IHDR', () => {
    expect(readImageSize(png(640, 480))).toEqual({ width: 640, height: 480 });
  });

  it('reads JPEG SOF after skipping other segments, including progressive', () => {
    expect(readImageSize(jpeg(1200, 800))).toEqual({ width: 1200, height: 800 });
    expect(readImageSize(jpeg(1200, 800, 0xc2))).toEqual({ width: 1200, height: 800 });
  });

  it('returns null for unknown or truncated data', () => {
    expect(readImageSize(new Uint8Array([1, 2, 3, 4, 5]))).toBeNull();
    expect(readImageSize(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
    expect(readImageSize(png(1, 1).subarray(0, 20))).toBeNull();
  });
});

describe('isCoverSizeAllowed', () => {
  it('accepts normal covers and unknown formats', () => {
    expect(isCoverSizeAllowed(png(4096, 4096))).toBe(true);
    expect(isCoverSizeAllowed(jpeg(640, 640))).toBe(true);
    expect(isCoverSizeAllowed(new Uint8Array([1, 2, 3]))).toBe(true);
  });

  it('rejects a side or pixel count over the limit', () => {
    expect(isCoverSizeAllowed(png(4097, 10))).toBe(false);
    expect(isCoverSizeAllowed(png(10, 65535 * 2))).toBe(false);
    expect(isCoverSizeAllowed(jpeg(65535, 65535))).toBe(false);
  });
});
