// Tiny synchronous event bus. Event names & payloads: docs/DESIGN.md §4.9.

export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this.map = new Map();
  }

  /**
   * Subscribe. Returns an unsubscribe function.
   * @param {string} name
   * @param {(data: any) => void} fn
   */
  on(name, fn) {
    let set = this.map.get(name);
    if (!set) this.map.set(name, (set = new Set()));
    set.add(fn);
    return () => this.off(name, fn);
  }

  once(name, fn) {
    const off = this.on(name, (d) => {
      off();
      fn(d);
    });
    return off;
  }

  off(name, fn) {
    this.map.get(name)?.delete(fn);
  }

  emit(name, data) {
    const set = this.map.get(name);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(data);
      } catch (err) {
        console.error(`[events] handler for "${name}" threw`, err);
      }
    }
  }

  clear() {
    this.map.clear();
  }
}

/** Global bus used across the game. */
export const events = new EventBus();
