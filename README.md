# tcp-seq-arith

TCP sequence number arithmetic over unsigned 32-bit integers with wraparound, as specified in RFC 793 and refined by RFC 1323.

## Usage

```js
// Run with: node --input-type=module
import {
  add,
  lessThan,
  lessThanOrEqual,
  greaterThan,
  greaterThanOrEqual,
  min,
  wrap,
  toU32,
  isU32,
  HALF,
  MOD,
} from './src/index.js';

// Addition wraps modulo 2^32.
add(0xffffffff, 1); // => 0

// Cyclic comparison: 0xffffffff is "before" 0 in TCP sequence space.
lessThan(0xffffffff, 0); // => true

// Inclusive comparison for window edge checks.
lessThanOrEqual(0xffffffff, 0); // => true

// Pick the earlier of two sequence numbers under cyclic ordering.
min(0xffffffff, 0); // => 0xffffffff
```

## Why this exists

TCP sequence numbers are 32-bit unsigned counters that wrap from 2^32-1 back to 0. Naive integer comparison breaks near the boundary: 0xffffffff must compare as "before" 0x00000000, not after. RFC 793 and RFC 1323 define comparison via signed arithmetic modulo 2^32, using a half-modulus of 2^31 to distinguish forward from backward.

This library implements that arithmetic with one deliberate decision worth stating plainly: **strict comparison is half-open at the midpoint.** Two sequence numbers exactly 2^31 apart are neither strictly before nor strictly after each other. The non-strict comparisons (`lessThanOrEqual`, `greaterThanOrEqual`) do include the midpoint, so they return `true` there. This matches the RFC 1323 description, where a difference of exactly half the space is ambiguous and the strict operators decline to order it.

All comparisons are total for any pair of 32-bit inputs: equal values are "neither strictly before nor strictly after", and `min` returns the first argument when the two are exactly 2^31 apart (the RFC says the choice is arbitrary in that case).

## The awkward edge

Values exactly 2^31 apart are ambiguous. `lessThan(0, 0x80000000)` returns `false`, and so does `lessThan(0x80000000, 0)`. If your window logic needs a total strict order at the midpoint, this library does not provide it on purpose — doing so would contradict RFC 1323. Use the non-strict operators if you need inclusive boundary checks.

Inputs must be integers in `[0, 2^32)` or small negative offsets in `[-2^32, 0)` (the kind JS naturally produces when subtracting two u32 values). Non-integers, `NaN`, `Infinity`, booleans, and strings are rejected. This is stricter than `Math.floor`-style coercion; the goal is to surface caller bugs rather than hide them.
