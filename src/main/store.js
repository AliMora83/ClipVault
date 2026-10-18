// Clip history and settings, persisted as JSON in the user-data folder.
// Pure Node (no Electron imports) so it can be unit-tested. Emits "change" after every mutation.

import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DEFAULT_SETTINGS = Object.freeze({
  historyLimit: 100, // max unpinned clips kept
  hotkey: 'CommandOrControl+Shift+V',
  pasteAfterSelect: true, // Enter pastes into the previous app (needs OS permission)
  paused: false, // stop capturing
  launchAtLogin: false,
  ignoreWhitespace: true, // skip clips that are only spaces/newlines
  maxClipLength: 200_000, // skip huge clips (characters)
  trackUsage: true, // count usage locally for the Usage screen (counts only, never clip text)
});

const MAX_HISTORY_LIMIT = 5000;
const SAVE_DEBOUNCE_MS = 300;

export class Store extends EventEmitter {
  /** @param {string} dir folder for history.json and settings.json */
  constructor(dir) {
    super();
    this.dir = dir;
    this.historyFile = path.join(dir, 'history.json');
    this.settingsFile = path.join(dir, 'settings.json');
    /** @type {{ id: string, text: string, pinned: boolean, createdAt: number, lastUsedAt: number }[]} newest first */
    this.history = [];
    this.settings = { ...DEFAULT_SETTINGS };
    this._saveTimer = null;
  }

  load() {
    fs.mkdirSync(this.dir, { recursive: true });
    const raw = readJson(this.historyFile, []);
    this.history = Array.isArray(raw)
      ? raw.filter((h) => h && typeof h.id === 'string' && typeof h.text === 'string')
      : [];
    this.settings = sanitizeSettings({ ...DEFAULT_SETTINGS, ...readJson(this.settingsFile, {}) });
    return this;
  }

  /** Adds a clip (or moves an identical one to the top). Returns the clip, or null if skipped. */
  add(text, now = Date.now()) {
    if (typeof text !== 'string' || text.length === 0) return null;
    if (this.settings.ignoreWhitespace && text.trim() === '') return null;
    if (text.length > this.settings.maxClipLength) return null;

    const existing = this.history.find((h) => h.text === text);
    if (existing) {
      existing.lastUsedAt = now;
      this._moveToTop(existing);
    } else {
      this.history.unshift({ id: crypto.randomUUID(), text, pinned: false, createdAt: now, lastUsedAt: now });
    }
    this._trim();
    this._changed();
    return this.history[0];
  }

  /** Marks a clip as just used and moves it to the top. */
  touch(id, now = Date.now()) {
    const clip = this.get(id);
    if (!clip) return null;
    clip.lastUsedAt = now;
    this._moveToTop(clip);
    this._changed();
    return clip;
  }

  get(id) {
    return this.history.find((h) => h.id === id) ?? null;
  }

  setPinned(id, pinned) {
    const clip = this.get(id);
    if (!clip) return null;
    clip.pinned = Boolean(pinned);
    this._trim();
    this._changed();
    return clip;
  }

  remove(id) {
    const before = this.history.length;
    this.history = this.history.filter((h) => h.id !== id);
    if (this.history.length !== before) this._changed();
  }

  clear({ keepPinned = true } = {}) {
    this.history = keepPinned ? this.history.filter((h) => h.pinned) : [];
    this._changed();
  }

  /** Applies a settings patch; unknown keys and wrong types are ignored. */
  updateSettings(patch) {
    this.settings = sanitizeSettings({ ...this.settings, ...patch }, this.settings);
    this._trim();
    this._changed();
    return this.settings;
  }

  /** Writes pending changes to disk immediately. */
  flush() {
    clearTimeout(this._saveTimer);
    this._saveTimer = null;
    writeJsonAtomic(this.historyFile, this.history);
    writeJsonAtomic(this.settingsFile, this.settings);
  }

  _moveToTop(clip) {
    this.history = [clip, ...this.history.filter((h) => h !== clip)];
  }

  // Pinned clips are never trimmed; unpinned ones beyond the limit go, oldest first.
  _trim() {
    let unpinned = 0;
    this.history = this.history.filter((h) => h.pinned || ++unpinned <= this.settings.historyLimit);
  }

  _changed() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.flush(), SAVE_DEBOUNCE_MS);
    this._saveTimer.unref?.(); // never keep the process alive just to save; flush() runs on quit
    this.emit('change');
  }
}

/** Keeps only known keys with the right type; falls back to `fallback` (or defaults). */
export function sanitizeSettings(input, fallback = DEFAULT_SETTINGS) {
  const out = {};
  for (const [key, def] of Object.entries(DEFAULT_SETTINGS)) {
    const value = input?.[key];
    if (typeof def === 'number') {
      const n = Math.round(Number(value));
      out[key] = Number.isFinite(n) && n > 0 ? n : (fallback[key] ?? def);
    } else {
      out[key] = typeof value === typeof def ? value : (fallback[key] ?? def);
    }
  }
  out.historyLimit = Math.min(out.historyLimit, MAX_HISTORY_LIMIT);
  return out;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}
