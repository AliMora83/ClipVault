// Watches the system clipboard and records new text into the store.
// Electron's clipboard API (v44+) is async, so polls are guarded against overlap.
// Dependencies are injected so this can be unit-tested with a fake clipboard.

export class ClipboardWatcher {
  /**
   * @param {object} deps
   * @param {{ readText(): Promise<string>, has(format: string): Promise<boolean> }} deps.clipboard
   * @param {import('./store.js').Store} deps.store
   * @param {string[]} [deps.concealedFormats] formats that mean "don't record this clip"
   * @param {number} [deps.intervalMs]
   */
  constructor({ clipboard, store, concealedFormats = [], intervalMs = 500 }) {
    this.clipboard = clipboard;
    this.store = store;
    this.concealedFormats = concealedFormats;
    this.intervalMs = intervalMs;
    this.lastSeen = '';
    this.timer = null;
    this.busy = false;
  }

  /** Starts polling. Whatever is already on the clipboard is not recorded. */
  async start() {
    this.lastSeen = await this.read();
    this.stop();
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  /** Call before writing to the clipboard ourselves, so our own write isn't recorded as new. */
  ignore(text) {
    this.lastSeen = text;
  }

  /** One poll. Returns true if a clip was recorded. */
  async tick() {
    if (this.busy) return false;
    this.busy = true;
    try {
      const text = await this.read();
      if (!text || text === this.lastSeen) return false;
      this.lastSeen = text;
      if (this.store.settings.paused) return false;
      if (await this.isConcealed()) return false;
      return this.store.add(text) !== null;
    } finally {
      this.busy = false;
    }
  }

  async read() {
    try {
      return (await this.clipboard.readText()) || '';
    } catch {
      return '';
    }
  }

  async isConcealed() {
    const checks = this.concealedFormats.map((f) =>
      this.clipboard.has(`electron application/osclipboard;format="${f}"`).catch(() => false),
    );
    return (await Promise.all(checks)).some(Boolean);
  }
}
