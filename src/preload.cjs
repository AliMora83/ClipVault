// Bridge between the sandboxed popup and the main process.
// Sandboxed preloads must be CommonJS. Channel names must match src/main/ipc.js.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clipvault', {
  getState: () => ipcRenderer.invoke('state:get'),
  select: (id, opts) => ipcRenderer.invoke('clip:select', id, opts),
  pin: (id, pinned) => ipcRenderer.invoke('clip:pin', id, pinned),
  remove: (id) => ipcRenderer.invoke('clip:delete', id),
  clear: () => ipcRenderer.invoke('history:clear'),
  hide: () => ipcRenderer.invoke('window:hide'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  onState: (cb) => ipcRenderer.on('state:changed', (_e, state) => cb(state)),
  onShown: (cb) => ipcRenderer.on('window:shown', (_e, opts) => cb(opts ?? {})),
});
