// Pastes into the app the user was in before opening ClipVault.
// Prefers a native keystroke (native-keys.js); falls back to a scripted one if that can't load.

import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { systemPreferences } from 'electron';
import { isMac, isWin, platform } from './config.js';
import { createNativePaster } from './native-keys.js';

const require = createRequire(import.meta.url);

/** @typedef {{ ok: true, method: string } | { ok: false, reason: 'accessibility' | 'automation' | 'unavailable', detail?: string }} PasteResult */

let nativePaster; // undefined = not tried yet, null = unavailable
function nativePasterOrNull() {
  if (nativePaster === undefined) {
    try {
      nativePaster = createNativePaster(require('koffi'), platform);
    } catch (err) {
      console.warn('[paste] native keystroke unavailable, using fallback:', err.message);
      nativePaster = null;
    }
  }
  return nativePaster;
}

/** @returns {Promise<PasteResult>} */
export async function pasteIntoFrontApp() {
  // macOS silently drops synthetic keystrokes from untrusted apps, so check first.
  if (isMac && !systemPreferences.isTrustedAccessibilityClient(false)) {
    return { ok: false, reason: 'accessibility' };
  }

  const native = nativePasterOrNull();
  if (native) {
    try {
      native();
      return { ok: true, method: 'native' };
    } catch (err) {
      console.warn('[paste] native keystroke failed, using fallback:', err.message);
    }
  }
  return scriptedPaste();
}

/** @returns {Promise<PasteResult>} */
function scriptedPaste() {
  const [cmd, args] = isMac
    ? ['osascript', ['-e', 'tell application "System Events" to keystroke "v" using command down']]
    : isWin
      ? [
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')",
          ],
        ]
      : ['xdotool', ['key', '--clearmodifiers', 'ctrl+v']];

  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout: 5000 }, (err, _stdout, stderr = '') => {
      if (!err) return resolve({ ok: true, method: cmd });
      const detail = String(stderr || err.message).trim();
      if (isMac && /-1743|not authori[sz]ed to send apple events/i.test(detail)) {
        return resolve({ ok: false, reason: 'automation', detail });
      }
      if (isMac) return resolve({ ok: false, reason: 'accessibility', detail });
      resolve({ ok: false, reason: 'unavailable', detail });
    });
  });
}
