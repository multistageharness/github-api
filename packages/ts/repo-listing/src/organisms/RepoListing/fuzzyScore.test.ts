import { fuzzyScore } from './fuzzyScore';

describe('fuzzyScore', () => {
  it('is neutral (0) for an empty query', () => {
    expect(fuzzyScore('', 'anything')).toBe(0);
  });

  it('scores a contiguous substring as 1000 - index', () => {
    expect(fuzzyScore('react', 'react')).toBe(1000);
    expect(fuzzyScore('act', 'react')).toBe(998);
  });

  it('is case-insensitive', () => {
    expect(fuzzyScore('REACT', 'facebook/React')).toBe(fuzzyScore('react', 'facebook/react'));
  });

  it('ranks an earlier substring above a later one', () => {
    expect(fuzzyScore('re', 'react')).toBeGreaterThan(fuzzyScore('re', 'facebook/react'));
  });

  it('scores an in-order subsequence below any substring, rewarding adjacency', () => {
    const adjacent = fuzzyScore('rct', 'ar-ct'); // r, then "ct" adjacent
    const spread = fuzzyScore('rct', 'ar-c-t');
    expect(adjacent).toBe(1 + 1 + 5);
    expect(spread).toBe(3);
    expect(adjacent).toBeGreaterThan(spread);
    expect(adjacent).toBeLessThan(fuzzyScore('ct', 'ar-ct'));
    // A match at index 0 counts as adjacent to the (virtual) previous char.
    expect(fuzzyScore('rct', 'r-ct')).toBe(5 + 1 + 5);
  });

  it('returns -1 when the query is not a subsequence', () => {
    expect(fuzzyScore('xyz', 'react')).toBe(-1);
    expect(fuzzyScore('tcaer', 'react')).toBe(-1);
  });
});
