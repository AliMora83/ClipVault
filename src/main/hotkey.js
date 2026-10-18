// Owns the single global "open ClipVault" shortcut.

export class Hotkey {
  /**
   * @param {Electron.GlobalShortcut} globalShortcut
   * @param {() => void} onPress
   */
  constructor(globalShortcut, onPress) {
    this.globalShortcut = globalShortcut;
    this.onPress = onPress;
    /** @type {string | null} the accelerator currently registered */
    this.current = null;
  }

  /** Replaces the current shortcut. Returns false (and registers nothing) if it's taken. */
  set(accelerator) {
    if (this.current) this.globalShortcut.unregister(this.current);
    this.current = null;
    let ok;
    try {
      ok = this.globalShortcut.register(accelerator, this.onPress);
    } catch {
      ok = false; // invalid accelerator string
    }
    if (ok) this.current = accelerator;
    return ok;
  }

  dispose() {
    if (this.current) this.globalShortcut.unregister(this.current);
    this.current = null;
  }
}
