// IPC handlers for the popup. Each handler checks the sender and validates its input
// before touching app state. Channel names must match src/preload.cjs.

import * as v from './ipc-validate.js';

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {object} deps
 * @param {import('./popup.js').Popup} deps.popup
 * @param {import('./store.js').Store} deps.store
 * @param {object} deps.actions
 */
export function registerIpc(ipcMain, { popup, store, actions }) {
  const handle = (channel, fn) =>
    ipcMain.handle(channel, (event, ...args) => {
      // Only our own popup may talk to the main process.
      if (!popup.webContents || event.sender !== popup.webContents) {
        throw new Error(`Rejected ${channel} from an unknown sender`);
      }
      return fn(...args);
    });

  handle('state:get', () => actions.snapshot());
  handle('clip:select', (id, opts) => actions.selectClip(v.clipId(id), v.selectOptions(opts)));
  handle('clip:pin', (id, pinned) => void store.setPinned(v.clipId(id), v.bool(pinned)));
  handle('clip:delete', (id) => void store.remove(v.clipId(id)));
  handle('history:clear', () => void store.clear({ keepPinned: true }));
  handle('window:hide', () => popup.hide());
  handle('settings:set', (patch) => actions.updateSettings(v.settingsPatch(patch)));
  handle('stats:get', () => actions.usageOverview());
  handle('stats:export', () => actions.exportUsage());
  handle('stats:reset', () => actions.resetUsage());
}
