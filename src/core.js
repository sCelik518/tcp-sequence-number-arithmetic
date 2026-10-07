/**
 * TCP Sequence Number Arithmetic over unsigned 32-bit integers with wraparound.
 *
 * TCP sequence numbers are 32-bit unsigned counters that wrap from 2^32 - 1
 * back to 0. RFC 793 and RFC 1323 define a "modulus" N = 2^32 and a constant
 * half-modulus N/2 = 2^31. Comparison is performed relative to an implied
 * origin using signed arithmetic modulo N:
 *
 *   a is "before" b  <=>  (b - a) mod N is in (0, N/2)      (a < b)
 *   a is "at or before" b  <=>  (b - a) mod N is in [0, N/2] (a <= b)
 *   a is "after" b  <=>  (a - b) mod N is in (0, N/2)        (a > b)
 *   a is "at or after" b  <=>  (a - b) mod N is in [0, N/2] (a >= b)
 *
 * The half-open interval for strict comparison means exactly equal sequence
 * numbers are neither strictly before nor strictly after each other, which is
 * the RFC 1323 semantics and avoids ambiguous comparisons near the midpoint.
 *
 * All comparisons are total: any two 32-bit inputs have a defined order.
 */

/** The modulus, 2^32. */
export const MOD = 0x100000000; // 2^32

/** The half-modulus, 2^31. Sequences differ by this much are ambiguous. */
export const HALF = 0x80000000; // 2^31

/** Largest unsigned 32-bit value. */
const U32_MAX = 0xffffffff;

/**
 * Coerce a value to a canonical unsigned 32-bit integer.
 *
 * Accepts integers in [0, 0xffffffff] or small negative offsets from a u32
 * base (produced naturally when subtracting two u32 values in JS). Negative
 * inputs outside the range [-2^32, 0) are rejected, since they cannot arise
 * from well-formed TCP arithmetic on valid inputs.
 *
 * Non-integer numbers and non-finite values are rejected because sequence
 * numbers are conceptually integers; accepting them would silently hide bugs
 * in callers. Booleans and non-numbers are rejected for the same reason.
 *
 * @param {number} v
 * @returns {number}
 * @throws {TypeError} if v is not a finite number
 * @throws {RangeError} if v is not a safe u32 input
 */
export function toU32(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new TypeError(`expected a finite number, got ${String(v)}`);
  }
  // Disallow booleans-as-number and reject non-integers up front so we never
  // silently truncate.
  if (!Number.isInteger(v)) {
    throw new RangeError(`expected an integer, got ${v}`);
  }
  // Allow small negative results produced by JS subtraction of two u32 values,
  // e.g. (0 - 1) === -1 which should wrap to 0xffffffff.
  if (v < -MOD || v > U32_MAX) {
    throw new RangeError(`value out of u32 range: ${v}`);
  }
  // Normalize negative values via two's-complement wrap.
  if (v < 0) {
    return v + MOD;
  }
  return v;
}

/**
 * Check whether a value is a canonical unsigned 32-bit integer in [0, 2^32).
 * Used internally for fast pre-validated comparisons.
 *
 * @param {number} v
 * @returns {boolean}
 */
export function isU32(v) {
  return (
    typeof v === 'number' &&
    Number.isInteger(v) &&
    v >= 0 &&
    v <= U32_MAX
  );
}

/**
 * Wrap a u32 input into the canonical [0, 2^32) range.
 *
 * This is a thin alias for {@link toU32}; it exists because callers often
 * want to signal "normalize this" rather than "validate this".
 *
 * @param {number} v
 * @returns {number}
 */
export function wrap(v) {
  return toU32(v);
}

/**
 * Add a u32 offset to a u32 base, wrapping modulo 2^32.
 *
 * We validate both inputs and use the mathematical identity that adding two
 * numbers in [0, 2^32) and taking the result modulo 2^32 gives the wrapped
 * sum. The intermediate sum is at most ~2^33, well within the exact-integer
 * range of double precision (2^53).
 *
 * @param {number} base
 * @param {number} offset
 * @returns {number}
 */
export function add(base, offset) {
  const b = toU32(base);
  const o = toU32(offset);
  const sum = b + o;
  // sum is in [0, 2^33), so a single conditional subtract normalizes.
  return sum >= MOD ? sum - MOD : sum;
}

/**
 * Cyclic, non-strict less-than: is `a` before `b` (or equal) in TCP sequence space?
 *
 * Equivalent to (b - a) mod 2^32 being in [0, 2^31]. Used for TCP window
 * edge checks, where inclusive bounds are the norm.
 *
 * @param {number} a
 * @param {number} b
 * @returns {boolean}
 */
export function lessThanOrEqual(a, b) {
  // Fast path for pre-validated canonical u32 inputs (the common case in
  // tight loops over already-normalized sequence numbers).
  if (isU32(a) && isU32(b)) {
    const diff = b - a; // in [-2^32+1, 2^32-1]
    // Wrap to [0, 2^32): if negative, add MOD once.
    const w = diff < 0 ? diff + MOD : diff;
    return w <= HALF;
  }
  const x = toU32(a);
  const y = toU32(b);
  const diff = y - x;
  const w = diff < 0 ? diff + MOD : diff;
  return w <= HALF;
}

/**
 * Cyclic, strict less-than: is `a` strictly before `b` in TCP sequence space?
 *
 * Equivalent to (b - a) mod 2^32 being in (0, 2^31). The open bounds mean
 * equal values are not strictly ordered, and values exactly 2^31 apart are
 * not strictly ordered either (they are ambiguous per RFC 1323).
 *
 * @param {number} a
 * @param {number} b
 * @returns {boolean}
 */
export function lessThan(a, b) {
  if (isU32(a) && isU32(b)) {
    const diff = b - a;
    const w = diff < 0 ? diff + MOD : diff;
    return w > 0 && w < HALF;
  }
  const x = toU32(a);
  const y = toU32(b);
  const diff = y - x;
  const w = diff < 0 ? diff + MOD : diff;
  return w > 0 && w < HALF;
}

/**
 * Cyclic greater-than-or-equal: is `a` after `b` (or equal)?
 *
 * Equivalent to (a - b) mod 2^32 being in [0, 2^31].
 *
 * @param {number} a
 * @param {number} b
 * @returns {boolean}
 */
export function greaterThanOrEqual(a, b) {
  return lessThanOrEqual(b, a);
}

/**
 * Cyclic strict greater-than: is `a` strictly after `b`?
 *
 * Equivalent to (a - b) mod 2^32 being in (0, 2^31). Equal values are not
 * strictly ordered, and values exactly 2^31 apart are ambiguous.
 *
 * @param {number} a
 * @param {number} b
 * @returns {boolean}
 */
export function greaterThan(a, b) {
  return lessThan(b, a);
}

/**
 * Pick the smaller of two sequence numbers under cyclic ordering.
 *
 * If the two values are exactly 2^31 apart (the ambiguous midpoint), either
 * may be returned; we choose `a`. This matches RFC 1323, which says the
 * choice is arbitrary in that case.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export function min(a, b) {
  return lessThanOrEqual(a, b) ? a : b;
}
