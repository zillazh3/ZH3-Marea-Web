// Reads the pixel size from a PNG or JPEG header without decoding, so an oversized image can be refused before a decoder allocates it.

export const MAX_COVER_SIDE = 4096;
export const MAX_COVER_PIXELS = 16_777_216;

export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The size of a PNG or JPEG, or null when the format is unknown or the header is truncated. */
export function readImageSize(bytes: Uint8Array): ImageSize | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && PNG_SIGNATURE.every((b, i) => bytes[i] === b)) {
    return { width: view.getUint32(16), height: view.getUint32(20) }; // IHDR follows the signature
  }
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1] ?? 0;
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    // SOF0-SOF15 carry the frame size, except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (i + 9 > bytes.length) return null;
      return { height: view.getUint16(i + 5), width: view.getUint16(i + 7) };
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2; // standalone markers have no length
      continue;
    }
    i += 2 + view.getUint16(i + 2);
  }
  return null;
}

/** False when the image is known to exceed the cover limits; an unknown format is allowed (the byte cap still applies). */
export function isCoverSizeAllowed(bytes: Uint8Array): boolean {
  const size = readImageSize(bytes);
  if (!size) return true;
  return (
    size.width <= MAX_COVER_SIDE &&
    size.height <= MAX_COVER_SIDE &&
    size.width * size.height <= MAX_COVER_PIXELS
  );
}
