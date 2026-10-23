// Uniform-grid spatial hash for circle entities ({x, y, r}). Rebuilt once per frame; queries
// are allocation-free when the caller passes an `out` array. Large entities are inserted
// into every cell their bounding box touches; queries de-duplicate with a stamp counter.

const OFFSET = 1 << 15;

export class SpatialHash {
  /** @param {number} [cellSize] world units per cell */
  constructor(cellSize = 128) {
    this.cell = cellSize;
    this.inv = 1 / cellSize;
    /** @type {Map<number, any[]>} */
    this.buckets = new Map();
    /** buckets touched this frame (cleared on next rebuild) */
    this.used = [];
    this.pool = [];
    this.stamp = 1;
    this.count = 0;
  }

  _key(cx, cy) {
    return (cx + OFFSET) * 65536 + (cy + OFFSET);
  }

  clear() {
    for (let i = 0; i < this.used.length; i++) {
      const b = this.used[i];
      b.length = 0;
      this.pool.push(b);
    }
    this.used.length = 0;
    this.buckets.clear();
    this.count = 0;
  }

  /** Insert an entity with x, y, r. */
  insert(e) {
    const inv = this.inv;
    const r = e.r || 0;
    const x0 = Math.floor((e.x - r) * inv);
    const x1 = Math.floor((e.x + r) * inv);
    const y0 = Math.floor((e.y - r) * inv);
    const y1 = Math.floor((e.y + r) * inv);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const k = this._key(cx, cy);
        let b = this.buckets.get(k);
        if (!b) {
          b = this.pool.pop() || [];
          this.buckets.set(k, b);
          this.used.push(b);
        }
        b.push(e);
      }
    }
    this.count++;
  }

  /**
   * Entities whose circle overlaps the query circle.
   * @param {number} x
   * @param {number} y
   * @param {number} r
   * @param {any[]} [out]
   * @param {(e:any)=>boolean} [filter]
   */
  query(x, y, r, out = [], filter) {
    const inv = this.inv;
    const x0 = Math.floor((x - r) * inv);
    const x1 = Math.floor((x + r) * inv);
    const y0 = Math.floor((y - r) * inv);
    const y1 = Math.floor((y + r) * inv);
    const stamp = ++this.stamp;
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const b = this.buckets.get(this._key(cx, cy));
        if (!b) continue;
        for (let i = 0; i < b.length; i++) {
          const e = b[i];
          if (e._qstamp === stamp) continue;
          e._qstamp = stamp;
          const dx = e.x - x;
          const dy = e.y - y;
          const rr = r + (e.r || 0);
          if (dx * dx + dy * dy > rr * rr) continue;
          if (filter && !filter(e)) continue;
          out.push(e);
        }
      }
    }
    return out;
  }

  /**
   * Visit overlapping entities without building an array. Return `true` from `fn` to stop.
   * @param {number} x
   * @param {number} y
   * @param {number} r
   * @param {(e:any)=>boolean|void} fn
   */
  each(x, y, r, fn) {
    const inv = this.inv;
    const x0 = Math.floor((x - r) * inv);
    const x1 = Math.floor((x + r) * inv);
    const y0 = Math.floor((y - r) * inv);
    const y1 = Math.floor((y + r) * inv);
    const stamp = ++this.stamp;
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const b = this.buckets.get(this._key(cx, cy));
        if (!b) continue;
        for (let i = 0; i < b.length; i++) {
          const e = b[i];
          if (e._qstamp === stamp) continue;
          e._qstamp = stamp;
          const dx = e.x - x;
          const dy = e.y - y;
          const rr = r + (e.r || 0);
          if (dx * dx + dy * dy > rr * rr) continue;
          if (fn(e) === true) return;
        }
      }
    }
  }
}
