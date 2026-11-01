// Lets one clip selection through at a time. A held-down Enter key (auto-repeat) or a double
// click can fire several selections within milliseconds; each one would paste, so the same
// text appeared twice (issue #3). Extra selections while one is running, or just after it, are dropped.

export class SelectGuard {
  /** @param {number} [cooldownMs] how long after a selection finishes to keep ignoring repeats */
  constructor(cooldownMs = 400) {
    this.cooldownMs = cooldownMs;
    this.busy = false;
    this.lastDoneAt = -Infinity;
  }

  /**
   * Runs `fn` unless another selection is in progress or just finished.
   * @template T
   * @param {() => Promise<T>} fn
   * @param {() => number} [now]
   * @returns {Promise<T | undefined>} undefined when the call was dropped
   */
  async run(fn, now = Date.now) {
    if (this.busy || now() - this.lastDoneAt < this.cooldownMs) return undefined;
    this.busy = true;
    try {
      return await fn();
    } finally {
      this.busy = false;
      this.lastDoneAt = now();
    }
  }
}
