/**
 * Element access that fails loudly: with `noUncheckedIndexedAccess` a plain index is `T | undefined`, and numeric code
 * should not carry `?? 0` guesses.
 */
export function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new RangeError(`index ${String(index)} is outside 0..${String(items.length - 1)}`);
  }
  return item;
}
