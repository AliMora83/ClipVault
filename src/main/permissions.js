// Explains a failed paste once per session, with a button to the right settings page.

import { app, dialog, shell, systemPreferences } from 'electron';

const SETTINGS_URL = {
  accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  automation: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Automation',
};

let explained = false;

/** @param {import('./paste.js').PasteResult & { ok: false }} result */
export async function explainPasteFailure(result) {
  if (explained) return; // the clip is already on the clipboard; don't nag
  explained = true;
  if (result.detail) console.warn('[paste] failed:', result.detail);

  // During development macOS attributes the keystroke to the app that launched `npm start`.
  const who = app.isPackaged ? 'ClipVault' : 'the app you ran "npm start" from (Terminal, iTerm, VS Code or Cursor)';

  const copy = {
    accessibility: {
      detail: `Your clip is copied. To paste it for you, turn on ${who} in Privacy & Security → Accessibility, then quit and reopen ClipVault.\n\nUntil then, press ⌘V to paste.`,
      url: SETTINGS_URL.accessibility,
    },
    automation: {
      detail: `Your clip is copied. To paste it for you, allow ${who} to control "System Events" in Privacy & Security → Automation, then quit and reopen ClipVault.`,
      url: SETTINGS_URL.automation,
    },
    unavailable: {
      detail:
        process.platform === 'linux'
          ? 'Your clip is copied. To paste it for you, install xdotool (for example: sudo apt install xdotool). Wayland sessions block simulated keystrokes, so press Ctrl+V there.'
          : 'Your clip is copied. Press Ctrl+V to paste it.',
      url: null,
    },
  }[result.reason];

  // Registers the app in the Accessibility list so the user only has to flip the switch.
  if (result.reason === 'accessibility') systemPreferences.isTrustedAccessibilityClient(true);

  const buttons = copy.url ? ['Open Settings', 'Not now'] : ['OK'];
  const { response } = await dialog.showMessageBox({
    type: 'info',
    message: 'Allow ClipVault to paste for you',
    detail: copy.detail,
    buttons,
    defaultId: 0,
    cancelId: buttons.length - 1,
  });
  if (copy.url && response === 0) shell.openExternal(copy.url);
}
