// ClipVault main process: wires the store, clipboard watcher, popup, tray, shortcut and IPC together.

import { app, clipboard, dialog, globalShortcut, ipcMain } from 'electron';
import { setTimeout as delay } from 'node:timers/promises';
import { CONCEALED_FORMATS, isMac, isWin, PASTE_DELAY_MS, platform, POLL_MS } from './config.js';
import { Store } from './store.js';
import { ClipboardWatcher } from './capture.js';
import { Popup } from './popup.js';
import { TrayMenu } from './tray.js';
import { Hotkey } from './hotkey.js';
import { registerIpc } from './ipc.js';
import { pasteIntoFrontApp } from './paste.js';
import { explainPasteFailure } from './permissions.js';
import { prettyHotkey } from '../shared/format.js';

/** @type {{ store: Store, watcher: ClipboardWatcher, popup: Popup, tray: TrayMenu, hotkey: Hotkey }} */
const ctx = {};

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => ctx.popup?.show());
  app.whenReady().then(start);
}

async function start() {
  if (isMac) app.dock.hide();

  const store = (ctx.store = new Store(app.getPath('userData')).load());
  const popup = (ctx.popup = new Popup().create());
  ctx.hotkey = new Hotkey(globalShortcut, () => popup.toggle());
  ctx.watcher = new ClipboardWatcher({ clipboard, store, concealedFormats: CONCEALED_FORMATS, intervalMs: POLL_MS });
  ctx.tray = new TrayMenu({
    store,
    currentHotkey: () => ctx.hotkey.current,
    onOpen: () => popup.show(),
    onSettings: () => popup.show({ view: 'settings' }),
    onSelect: (id) => selectClip(id, { paste: false }),
  });

  registerIpc(ipcMain, { popup, store, actions: { snapshot, selectClip, updateSettings } });

  // Every store change refreshes the tray and the popup.
  store.on('change', () => {
    ctx.tray.update();
    popup.send('state:changed', snapshot());
  });

  if (!ctx.hotkey.set(store.settings.hotkey)) warnHotkeyTaken(store.settings.hotkey);
  ctx.tray.update();
  applyLoginItem(store.settings.launchAtLogin);
  await ctx.watcher.start();
}

function snapshot() {
  const { history, settings } = ctx.store;
  return { history, settings, platform, hotkeyActive: Boolean(ctx.hotkey.current) };
}

async function selectClip(id, { paste = false } = {}) {
  const clip = ctx.store.touch(id);
  if (!clip) return;
  ctx.watcher.ignore(clip.text); // our own write isn't a new copy
  await clipboard.writeText(clip.text);
  ctx.popup.hide();
  if (!paste) return;
  await delay(PASTE_DELAY_MS); // let focus return to the previous app
  const result = await pasteIntoFrontApp();
  if (!result.ok) explainPasteFailure(result);
}

function updateSettings(patch) {
  const { store, hotkey } = ctx;
  const before = store.settings;
  const after = store.updateSettings(patch);
  let hotkeyOk = true;
  if (after.hotkey !== before.hotkey) {
    hotkeyOk = hotkey.set(after.hotkey);
    if (!hotkeyOk) {
      store.updateSettings({ hotkey: before.hotkey }); // keep the shortcut that works
      hotkey.set(before.hotkey);
    }
    ctx.tray.update();
  }
  if (after.launchAtLogin !== before.launchAtLogin) applyLoginItem(after.launchAtLogin);
  return { hotkeyOk };
}

function applyLoginItem(openAtLogin) {
  if (isMac || isWin) app.setLoginItemSettings({ openAtLogin });
}

function warnHotkeyTaken(accelerator) {
  dialog.showMessageBox({
    type: 'info',
    message: 'Shortcut unavailable',
    detail: `${prettyHotkey(accelerator, platform)} is already used by another app. Choose a different one under Settings in the ClipVault ${isMac ? 'menu bar' : 'tray'} menu.`,
  });
}

app.on('window-all-closed', (e) => e.preventDefault()); // keep running in the tray
app.on('will-quit', () => {
  ctx.hotkey?.dispose();
  ctx.watcher?.stop();
  ctx.store?.flush();
});
