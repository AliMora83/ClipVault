// ClipVault main process: wires the store, clipboard watcher, popup, tray, shortcut and IPC together.

import { app, clipboard, dialog, globalShortcut, ipcMain, Notification } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { CONCEALED_FORMATS, isMac, isWin, PASTE_DELAY_MS, platform, POLL_MS } from './config.js';
import { Store } from './store.js';
import { UsageStats, monthKey, previousMonth } from './stats.js';
import { ClipboardWatcher } from './capture.js';
import { Popup } from './popup.js';
import { TrayMenu } from './tray.js';
import { Hotkey } from './hotkey.js';
import { registerIpc } from './ipc.js';
import { pasteIntoFrontApp } from './paste.js';
import { explainPasteFailure } from './permissions.js';
import { prettyHotkey } from '../shared/format.js';

/** @type {{ store: Store, stats: UsageStats, watcher: ClipboardWatcher, popup: Popup, tray: TrayMenu, hotkey: Hotkey }} */
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
  const stats = (ctx.stats = new UsageStats(app.getPath('userData')).load());
  const popup = (ctx.popup = new Popup().create());
  ctx.hotkey = new Hotkey(globalShortcut, () => popup.toggle());
  ctx.watcher = new ClipboardWatcher({
    clipboard,
    store,
    concealedFormats: CONCEALED_FORMATS,
    intervalMs: POLL_MS,
    onCapture: () => track('captured'),
  });
  ctx.tray = new TrayMenu({
    store,
    currentHotkey: () => ctx.hotkey.current,
    usageLine: () => (store.settings.trackUsage ? usageLine() : null),
    onOpen: () => popup.show(),
    onSettings: () => popup.show({ view: 'settings' }),
    onUsage: () => popup.show({ view: 'usage' }),
    onSelect: (id) => selectClip(id, { paste: store.settings.pasteAfterSelect }),
  });

  registerIpc(ipcMain, {
    popup,
    store,
    actions: { snapshot, selectClip, updateSettings, usageOverview, exportUsage, resetUsage },
  });

  // Every change refreshes the tray and the popup.
  store.on('change', () => {
    ctx.tray.update();
    popup.send('state:changed', snapshot());
  });
  stats.on('change', () => ctx.tray.update());
  popup.on('shown', () => track('opened'));

  // Summarise the month that just ended: now, and hourly in case the app stays open over month-end.
  setTimeout(showMonthlyReport, 5_000);
  setInterval(showMonthlyReport, 60 * 60 * 1000).unref();

  if (!ctx.hotkey.set(store.settings.hotkey)) warnHotkeyTaken(store.settings.hotkey);
  ctx.tray.update();
  applyLoginItem(store.settings.launchAtLogin);
  await ctx.watcher.start();
}

function snapshot() {
  const { history, settings } = ctx.store;
  return { history, settings, platform, hotkeyActive: Boolean(ctx.hotkey.current) };
}

async function selectClip(id, { paste = false, viaSearch = false } = {}) {
  const clip = ctx.store.touch(id);
  if (!clip) return;
  ctx.watcher.ignore(clip.text); // our own write isn't a new copy
  await clipboard.writeText(clip.text);
  ctx.popup.hide();
  if (viaSearch) track('searched');
  if (!paste) return track('copied');
  await delay(PASTE_DELAY_MS); // let focus return to the previous app
  const result = await pasteIntoFrontApp();
  if (result.ok) return track('pasted');
  track('copied'); // the clip is on the clipboard; the user pastes it themselves
  explainPasteFailure(result);
}

// ---------- Usage tracking (counts only, stored on this computer) ----------

function track(event) {
  if (ctx.store.settings.trackUsage) ctx.stats.record(event);
}

function usageOverview() {
  return { ...ctx.stats.overview(), enabled: ctx.store.settings.trackUsage };
}

function usageLine() {
  const { used } = ctx.stats.month(monthKey());
  return `This month: ${used.toLocaleString()} clip${used === 1 ? '' : 's'} used`;
}

async function exportUsage() {
  const { canceled, filePath } = await ctx.popup.withDialog(() =>
    dialog.showSaveDialog(ctx.popup.win, {
      title: 'Export usage',
      defaultPath: path.join(app.getPath('downloads'), `clipvault-usage-${monthKey()}.csv`),
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    }),
  );
  if (canceled || !filePath) return { saved: false };
  fs.writeFileSync(filePath, ctx.stats.toCSV());
  return { saved: true, name: path.basename(filePath) };
}

async function resetUsage() {
  const { response } = await ctx.popup.withDialog(() =>
    dialog.showMessageBox(ctx.popup.win, {
      type: 'warning',
      message: 'Reset usage stats?',
      detail: 'This deletes all usage counts. Your clips are not affected.',
      buttons: ['Reset', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
    }),
  );
  if (response !== 0) return { reset: false };
  ctx.stats.reset();
  return { reset: true };
}

function showMonthlyReport() {
  if (!ctx.store.settings.trackUsage) return;
  const report = ctx.stats.takeMonthlyReport();
  if (!report || !Notification.isSupported()) return;
  const name = new Date(`${report.month}-15T12:00:00`).toLocaleString('en', { month: 'long' });
  const previous = ctx.stats.month(previousMonth(report.month));
  const change =
    previous.used > 0
      ? ` ${report.used >= previous.used ? 'Up' : 'Down'} ${Math.abs(Math.round(((report.used - previous.used) / previous.used) * 100))}% on the month before.`
      : '';
  const n = new Notification({
    title: `Your ${name} with ClipVault`,
    body: `${report.used.toLocaleString()} clips used (${report.totals.pasted.toLocaleString()} pasted) on ${report.activeDays} days.${change}`,
    silent: true,
  });
  n.on('click', () => ctx.popup.show({ view: 'usage' }));
  n.show();
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
  ctx.stats?.flush();
});
