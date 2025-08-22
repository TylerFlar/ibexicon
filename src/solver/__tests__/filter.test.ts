import { describe, it, expect } from 'vitest';
import { filterCandidatesArray, CandidateSet } from '../filter';
import { feedbackPattern } from '../feedback';

// Deterministic PRNG (mulberry32)
function rng(seed: number) {
  return function() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const letters = 'abcdefghijklmnopqrstuvwxyz';
function randomWord(len: number, r: () => number): string {
  let out = '';
  for (let i = 0; i < len; i++) out += letters[(r() * letters.length) | 0];
  return out;
}

// Build random word list (unique) with lengths 5..8
function buildWordList(count: number, seed = 12345): string[] {
  const r = rng(seed);
  const set = new Set<string>();
  while (set.size < count) {
    const len = 5 + ((r() * 4) | 0); // 5..8
    set.add(randomWord(len, r));
  }
  return Array.from(set);
}

// Helper: choose random element from array using rng
function choice<T>(arr: T[], r: () => number): T {
  return arr[(r() * arr.length) | 0]!;
}

describe('CandidateSet.applyFeedback equivalence (deterministic examples)', () => {
  it('all greens scenario reduces to exact word', () => {
    const list = ['apple', 'apply', 'amply'];
    const guess = 'apple';
    const secret = 'apple';
    const p = feedbackPattern(guess, secret);
    const arrFiltered = filterCandidatesArray(list, guess, p);
    const cs = new CandidateSet(list);
    cs.applyFeedback(guess, p);
    const alive = cs.getAliveWords();
    expect(arrFiltered).toEqual(['apple']);
    expect(alive).toEqual(arrFiltered);
  });

  it('duplicate/yellow handling example', () => {
    const list = ['allee', 'eagle', 'cabal', 'abbey', 'cigar'];
    const guess = 'eagle';
    const secret = 'allee';
    const p = feedbackPattern(guess, secret);
    const arrFiltered = filterCandidatesArray(list, guess, p);
    const cs = new CandidateSet(list);
    cs.applyFeedback(guess, p);
    const alive = cs.getAliveWords();
    expect(alive).toEqual(arrFiltered);
    // Ensure secret survived and guess may or may not depending on pattern match
    expect(alive).toContain(secret);
  });
});

describe('CandidateSet.applyFeedback equivalence (random stress)', () => {
  it('matches array filter for random selections (30 trials)', () => {
    const list = buildWordList(500, 9999);

    // Group by length for valid guess/secret pairing
    const byLen: Record<number, string[]> = {};
    for (const w of list) {
      (byLen[w.length] ||= []).push(w);
    }

    const r = rng(424242);
    for (let trial = 0; trial < 30; trial++) {
      // Pick a length with at least 2 words
      const lengths = Object.keys(byLen).map(Number).filter(L => byLen[L]!.length >= 2);
      const L = choice(lengths, r);
      const bucket = byLen[L]!;
      const guess = choice(bucket, r);
      const secret = choice(bucket, r);
      const p = feedbackPattern(guess, secret);

      const arrFiltered = filterCandidatesArray(bucket, guess, p);
      const cs = new CandidateSet(bucket);
      cs.applyFeedback(guess, p);
      const alive = cs.getAliveWords();

      // They should be identical arrays in same order
      expect(alive).toEqual(arrFiltered);
      // Secret should not be eliminated
      expect(alive).toContain(secret);
    }
  });
});
