/**
 * Numeric helpers that reproduce the exact IEEE-754 behaviour of the Python
 * reference implementation (CPython >= 3.12), so plans are bit-identical.
 */

/** CPython's `sum()` for floats: Neumaier compensated summation (3.12+). */
export function pySum(values: Iterable<number>): number {
  let result = 0;
  let compensation = 0;
  for (const x of values) {
    const t = result + x;
    if (Math.abs(result) >= Math.abs(x)) compensation += result - t + x;
    else compensation += x - t + result;
    result = t;
  }
  if (compensation !== 0 && Number.isFinite(compensation)) result += compensation;
  return result;
}

/** Python's `round(x)` for a float: round half to even. */
export function roundHalfEven(x: number): number {
  const floor = Math.floor(x);
  const diff = x - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}
