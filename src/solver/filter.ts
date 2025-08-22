import { feedbackPattern } from "./feedback";
import { type PatternValue, decodePattern } from "./pattern";
import { Bitset } from "./bitset";

export function filterCandidatesArray(words: string[], guess: string, pat: PatternValue): string[] {
  const L = guess.length;
  const target = decodePattern(pat, L);
  const out: string[] = [];
  for (const w of words) {
    if (w.length !== L) continue; // length mismatch can't match pattern
    const p2 = feedbackPattern(guess, w);
    const decoded = decodePattern(p2, L);
    let same = true;
    for (let i = 0; i < L; i++) {
      if (decoded[i] !== target[i]) { same = false; break; }
    }
    if (same) out.push(w);
  }
  return out;
}

export class CandidateSet {
  private words: string[];
  private alive: Bitset;

  constructor(words: string[]) {
    this.words = words.slice();
    this.alive = new Bitset(this.words.length);
    this.alive.fillAll();
  }

  size(): number { return this.words.length; }
  aliveCount(): number { return this.alive.count(); }

  *indices(): Iterable<number> {
    for (const i of this.alive.indices()) {
      yield i;
    }
  }

  applyFeedback(guess: string, pat: PatternValue): void {
    const L = guess.length;
    const target = decodePattern(pat, L);
    for (const i of this.alive.indices()) {
      const w = this.words[i]!;
      if (w.length !== L) { this.alive.clear(i); continue; }
      const p2 = decodePattern(feedbackPattern(guess, w), L);
      let same = true;
      for (let j = 0; j < L; j++) {
        if (p2[j] !== target[j]) { same = false; break; }
      }
      if (!same) this.alive.clear(i);
    }
  }

  getAliveWords(): string[] {
    const out: string[] = [];
    for (const i of this.alive.indices()) {
      out.push(this.words[i]!);
    }
    return out;
  }
}
