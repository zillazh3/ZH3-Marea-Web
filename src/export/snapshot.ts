import type { CanvasKit, Surface } from 'canvaskit-wasm';

const THUMB_WIDTH = 270;

/** 64-bit FNV-1a hex digest over raw RGBA bytes for pre-encode determinism checks. */
export function hashRgba(bytes: Uint8Array): string {
  let lo = 0x811c9dc5 >>> 0;
  let hi = 0xcbf29ce4 >>> 0;
  for (const b of bytes) {
    lo ^= b;
    lo = Math.imul(lo, 0x01000193) >>> 0;
    hi = Math.imul(hi ^ ((lo >>> 16) ^ b), 0x01000193) >>> 0;
  }
  return hi.toString(16).padStart(8, '0') + lo.toString(16).padStart(8, '0');
}

export function captureSurfaceRgbaHash(
  ck: CanvasKit,
  surface: Surface,
  w: number,
  h: number,
): string {
  const snap = surface.makeImageSnapshot();
  try {
    const pixels = snap.readPixels(0, 0, {
      width: w,
      height: h,
      colorType: ck.ColorType.RGBA_8888,
      alphaType: ck.AlphaType.Premul,
      colorSpace: ck.ColorSpace.SRGB,
    });
    if (!pixels) throw new Error('CanvasKit failed to read exported frame pixels.');
    const u8 = pixels instanceof Uint8Array ? pixels : new Uint8Array(pixels.buffer);
    return hashRgba(u8);
  } finally {
    snap.delete();
  }
}

export function captureThumbnailPng(
  ck: CanvasKit,
  surface: Surface,
  w: number,
  h: number,
): ArrayBuffer | null {
  const snap = surface.makeImageSnapshot();
  const tw = THUMB_WIDTH;
  const th = Math.max(2, Math.round((THUMB_WIDTH * h) / w / 2) * 2);
  const thumbSurf = ck.MakeSurface(tw, th);
  if (!thumbSurf) {
    snap.delete();
    return null;
  }
  try {
    thumbSurf
      .getCanvas()
      .drawImageRectOptions(
        snap,
        ck.XYWHRect(0, 0, w, h),
        ck.XYWHRect(0, 0, tw, th),
        ck.FilterMode.Linear,
        ck.MipmapMode.None,
        null,
      );
    const small = thumbSurf.makeImageSnapshot();
    try {
      const encoded = small.encodeToBytes();
      return encoded ? encoded.slice().buffer : null;
    } finally {
      small.delete();
    }
  } finally {
    snap.delete();
    thumbSurf.dispose();
  }
}
