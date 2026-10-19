// The settings view: toggles, history size and the shortcut recorder.

import { $ } from './dom.js';
import { toAccelerator } from '../shared/accelerator.js';
import { prettyHotkey } from '../shared/format.js';

export class SettingsPanel {
  /**
   * @param {object} deps
   * @param {typeof window.clipvault} deps.api
   * @param {() => { settings: object, platform: string }} deps.getState
   * @param {(view: string) => void} deps.show switches the visible view
   * @param {() => void} deps.onClose
   * @param {() => void} deps.onOpenUsage
   */
  constructor({ api, getState, show, onClose, onOpenUsage }) {
    this.api = api;
    this.getState = getState;
    this.show = show;
    this.onClose = onClose;
    this.onOpenUsage = onOpenUsage;
    this.recording = false;
    this.bind();
  }

  get isOpen() {
    return !$('view-settings').hidden;
  }

  get isMac() {
    return this.getState().platform === 'darwin';
  }

  open() {
    this.show('settings');
    this.message('');
    this.fill();
    $('close-settings').focus();
  }

  close() {
    this.show('history');
    this.onClose();
  }

  /** Refresh controls from state (skipped while recording a shortcut). */
  fill() {
    if (this.recording) return;
    const { settings: s, platform } = this.getState();
    $('set-hotkey').value = prettyHotkey(s.hotkey, platform);
    $('set-limit').value = s.historyLimit;
    $('set-paste').checked = s.pasteAfterSelect;
    $('set-paused').checked = s.paused;
    $('set-login').checked = s.launchAtLogin;
    $('set-login').disabled = platform === 'linux';
    $('set-whitespace').checked = s.ignoreWhitespace;
    $('set-track').checked = s.trackUsage;
  }

  message(text) {
    $('settings-msg').textContent = text;
  }

  async save(patch, confirmation) {
    try {
      const res = await this.api.setSettings(patch);
      if (res?.hotkeyOk === false) {
        this.message('Another app already uses that shortcut. Kept your current one.');
        this.fill();
      } else if (confirmation) {
        this.message(confirmation);
      }
    } catch {
      this.message('Couldn’t save that setting. Try again.');
      this.fill();
    }
  }

  bind() {
    $('close-settings').addEventListener('click', () => this.close());

    const toggle = (id, key, on, off = on) =>
      $(id).addEventListener('change', (e) => this.save({ [key]: e.target.checked }, e.target.checked ? on : off));
    toggle(
      'set-paste',
      'pasteAfterSelect',
      'Choosing a clip will paste it into your app.',
      'Choosing a clip will copy it only.',
    );
    toggle('set-paused', 'paused', 'Capture paused.', 'Capture resumed.');
    toggle('set-login', 'launchAtLogin', 'ClipVault will start when you sign in.', 'ClipVault won’t start at sign-in.');
    toggle('set-whitespace', 'ignoreWhitespace', 'Blank clips will be skipped.', 'Blank clips will be kept.');
    toggle('set-track', 'trackUsage', 'Usage tracking on.', 'Usage tracking off. Existing counts are kept.');
    $('open-usage').addEventListener('click', () => this.onOpenUsage());

    $('set-limit').addEventListener('change', (e) => {
      const n = Math.max(10, Math.min(5000, Math.round(Number(e.target.value) || 100)));
      e.target.value = n;
      this.save({ historyLimit: n }, `Keeping up to ${n} unpinned clips.`);
    });

    $('clear-history').addEventListener('click', async () => {
      await this.api.clear();
      this.message('History cleared. Pinned clips kept.');
    });

    const input = $('set-hotkey');
    input.addEventListener('focus', () => {
      this.recording = true;
      input.classList.add('recording');
      input.value = 'Press keys…';
    });
    input.addEventListener('blur', () => {
      this.recording = false;
      input.classList.remove('recording');
      this.fill();
    });
    input.addEventListener('keydown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') return input.blur();
      const result = toAccelerator(e, this.isMac);
      if (result.pending) return;
      if (result.error) return this.message(result.error);
      input.blur();
      this.save(
        { hotkey: result.accelerator },
        `Shortcut set to ${prettyHotkey(result.accelerator, this.getState().platform)}.`,
      );
    });
  }
}
