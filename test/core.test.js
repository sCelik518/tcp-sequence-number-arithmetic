import { test } from 'node:test';
import assert from 'node:assert/strict';
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
} from '../src/core.js';

// Basic arithmetic ----------------------------------------------------------

test('add wraps at 2^32', () => {
  assert.equal(add(0xffffffff, 1), 0);
  assert.equal(add(0xffffffff, 2), 1);
  assert.equal(add(1, 0xffffffff), 0);
  assert.equal(add(10, 20), 30);
  assert.equal(add(0, 0), 0);
});

test('add accepts negative offsets that wrap into range', () => {
  // -1 as a two's-complement u32 offset is 0xffffffff.
  assert.equal(add(0, -1), 0xffffffff);
  assert.equal(add(5, -1), 4);
});

test('add rejects non-integer and out-of-range inputs', () => {
  assert.throws(() => add(0.5, 1), RangeError);
  assert.throws(() => add(0, 1.5), RangeError);
  assert.throws(() => add(-MOD - 1, 0), RangeError);
  assert.throws(() => add(0, MOD), RangeError);
  assert.throws(() => add('1', 0), TypeError);
  assert.throws(() => add(0, true), TypeError);
});

test('toU32 normalizes small negatives via two\'s complement', () => {
  assert.equal(toU32(-1), 0xffffffff);
  assert.equal(toU32(-2), 0xfffffffe);
  assert.equal(toU32(0), 0);
  assert.equal(toU32(0xffffffff), 0xffffffff);
});

test('toU32 rejects out-of-range and non-integer values', () => {
  assert.throws(() => toU32(MOD), RangeError);
  assert.throws(() => toU32(-MOD - 1), RangeError);
  assert.throws(() => toU32(1.1), RangeError);
  assert.throws(() => toU32(NaN), TypeError);
  assert.throws(() => toU32(Infinity), TypeError);
  assert.throws(() => toU32('0'), TypeError);
});

test('wrap is an alias for toU32', () => {
  assert.equal(wrap(-1), 0xffffffff);
  assert.equal(wrap(0), 0);
});

test('isU32 recognizes canonical u32 values', () => {
  assert.equal(isU32(0), true);
  assert.equal(isU32(0xffffffff), true);
  assert.equal(isU32(-1), false);
  assert.equal(isU32(MOD), false);
  assert.equal(isU32(1.5), false);
  assert.equal(isU32('0'), false);
});

// Strict lessThan ------------------------------------------------------------

test('lessThan handles ordinary forward ordering', () => {
  assert.equal(lessThan(10, 20), true);
  assert.equal(lessThan(20, 10), false);
  assert.equal(lessThan(0, 1), true);
});

test('lessThan is false for equal values', () => {
  assert.equal(lessThan(5, 5), false);
  assert.equal(lessThan(0, 0), false);
  assert.equal(lessThan(0xffffffff, 0xffffffff), false);
});

test('lessThan crosses the 2^32 wraparound boundary', () => {
  // 0xffffffff is "before" 0 in TCP sequence space.
  assert.equal(lessThan(0xffffffff, 0), true);
  assert.equal(lessThan(0, 0xffffffff), false);
  assert.equal(lessThan(0xfffffffe, 1), true);
});

test('lessThan is false for values exactly half the space apart (ambiguous)', () => {
  // RFC 1323: a difference of exactly 2^31 is ambiguous; not strictly less.
  assert.equal(lessThan(0, HALF), false);
  assert.equal(lessThan(HALF, 0), false);
  assert.equal(lessThan(1000, 1000 + HALF), false);
  assert.equal(lessThan(1000 + HALF, 1000), false);
});

test('lessThan treats a difference just under half as strictly less', () => {
  assert.equal(lessThan(0, HALF - 1), true);
  assert.equal(lessThan(HALF - 1, 0), false);
});

test('lessThan validates inputs', () => {
  assert.throws(() => lessThan(0.5, 1), RangeError);
  assert.throws(() => lessThan(0, 1.5), RangeError);
  assert.throws(() => lessThan(NaN, 0), TypeError);
});

// Non-strict lessThanOrEqual -------------------------------------------------

test('lessThanOrEqual is true for equal values', () => {
  assert.equal(lessThanOrEqual(5, 5), true);
  assert.equal(lessThanOrEqual(0, 0), true);
});

test('lessThanOrEqual is true at the half-modulus boundary', () => {
  // Unlike strict lessThan, the non-strict version includes the midpoint.
  assert.equal(lessThanOrEqual(0, HALF), true);
  assert.equal(lessThanOrEqual(0, HALF - 1), true);
  // But just past half, it flips.
  assert.equal(lessThanOrEqual(0, HALF + 1), false);
});

test('lessThanOrEqual crosses the wraparound', () => {
  assert.equal(lessThanOrEqual(0xffffffff, 0), true);
  assert.equal(lessThanOrEqual(0, 0xffffffff), false);
});

// greaterThan / greaterThanOrEqual ------------------------------------------

test('greaterThan is the mirror of lessThan', () => {
  assert.equal(greaterThan(20, 10), true);
  assert.equal(greaterThan(10, 20), false);
  assert.equal(greaterThan(5, 5), false);
  assert.equal(greaterThan(0, 0xffffffff), true);
});

test('greaterThanOrEqual is the mirror of lessThanOrEqual', () => {
  assert.equal(greaterThanOrEqual(5, 5), true);
  assert.equal(greaterThanOrEqual(0, HALF), true);
  assert.equal(greaterThanOrEqual(0xffffffff, 0), false);
});

// min ------------------------------------------------------------------------

test('min picks the earlier sequence number under cyclic ordering', () => {
  assert.equal(min(10, 20), 10);
  assert.equal(min(20, 10), 10);
  assert.equal(min(0xffffffff, 0), 0xffffffff);
  assert.equal(min(0, 0xffffffff), 0xffffffff);
});

test('min is reflexive for equal inputs', () => {
  assert.equal(min(7, 7), 7);
  assert.equal(min(0, 0), 0);
});

test('min returns either value at the ambiguous midpoint (we pick a)', () => {
  // Exactly 2^31 apart: ambiguous per RFC 1323. Our implementation picks `a`.
  assert.equal(min(1000, 1000 + HALF), 1000);
  assert.equal(min(1000 + HALF, 1000), 1000 + HALF);
});

// Consistency properties -----------------------------------------------------

test('exactly one of a<b, a==b, a>b holds for all near values', () => {
  // Trichotomy check around the non-strict boundary: for values strictly
  // less than 2^31 apart, exactly one of <, ==, > holds.
  const cases = [
    [10, 20],
    [20, 10],
    [5, 5],
    [0, 1],
    [0xffffffff, 0],
    [0, 0xffffffff],
    [0, HALF - 1],
    [HALF - 1, 0],
  ];
  for (const [a, b] of cases) {
    const lt = lessThan(a, b);
    const eq = a === b;
    const gt = greaterThan(a, b);
    const count = [lt, eq, gt].filter(Boolean).length;
    assert.equal(count, 1, `trichotomy failed for (${a}, ${b}): lt=${lt}, eq=${eq}, gt=${gt}`);
  }
});
