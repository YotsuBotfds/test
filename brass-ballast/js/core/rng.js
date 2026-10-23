// Seeded pseudo-random numbers (mulberry32). Use `world.rng` for anything that should be
// reproducible from a run seed; `Math.random` is fine for purely cosmetic noise.

import { TAU } from './math.js';

export class RNG {
  /** @param {number} [seed] */
  constructor(seed = (Math.random() * 2 ** 32) >>> 0) {
    this.seed = seed >>> 0;
    this.state = this.seed;
  }

  /** @returns {number} float in [0, 1) */
  next() {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(a, b) {
    return a + (b - a) * this.next();
  }

  /** Integer in [a, b] inclusive. */
  int(a, b) {
    return a + Math.floor(this.next() * (b - a + 1));
  }

  chance(p) {
    return this.next() < p;
  }

  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }

  angle() {
    return this.next() * TAU;
  }

  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /**
   * Weighted pick.
   * @template T
   * @param {T[]} items
   * @param {(item: T) => number} weightOf
   * @returns {T | undefined}
   */
  weighted(items, weightOf) {
    let total = 0;
    for (const it of items) total += Math.max(0, weightOf(it));
    if (total <= 0) return undefined;
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, weightOf(it));
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }

  /** Weighted pick from an object map {key: weight}; returns the key. */
  weightedKey(map) {
    const keys = Object.keys(map);
    return this.weighted(keys, (k) => map[k]);
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Approximately normal, mean 0, sd 1. */
  gauss() {
    let u = 0;
    let v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  }

  fork() {
    return new RNG((this.next() * 2 ** 32) >>> 0);
  }
}

/** FNV-1a 32-bit string hash. */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Seed for a calendar day, e.g. dateSeed(new Date()) — stable for everyone that day (UTC). */
export function dateSeed(date) {
  const d = date instanceof Date ? date : new Date(date);
  const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
  return hashString(`brass-ballast:${key}`);
}

/** Shared cosmetic RNG (not reproducible across runs). */
export const fxRng = new RNG();
