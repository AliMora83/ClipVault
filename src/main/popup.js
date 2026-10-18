// The history popup: a frameless window that opens near the cursor and hides on blur.

import { EventEmitter } from 'node:events';
import { app, BrowserWindow, nativeTheme, screen } from 'electron';
import { isMac, paths, POPUP_SIZE, THEME_BACKGROUND } from './config.js';
import { placeNear } from './geometry.js';

/** Emits "shown" each time the popup opens. */
export class Popup extends EventEmitter {
  constructor() {
    super();
    /** @type {BrowserWindow | null} */
    this.win = null;
    this.dialogOpen = false;
  }

  create() {
    this.win = new BrowserWindow({
      ...POPUP_SIZE,
      show: false,
      frame: false,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      fullscreenable: false,
      minimizable: false,
      maximizable: false,
      transparent: false,
      roundedCorners: true,
      backgroundColor: themeBackground(),
      icon: paths.appIcon,
      webPreferences: {
        preload: paths.preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    if (isMac) this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    nativeTheme.on('updated', () => this.alive && this.win.setBackgroundColor(themeBackground()));
    this.win.on('blur', () => {
      if (this.dialogOpen || this.win.webContents.isDevToolsOpened()) return;
      this.hide();
    });
    // Links in clips must never navigate the popup itself.
    this.win.webContents.on('will-navigate', (e) => e.preventDefault());
    this.win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    this.win.loadFile(paths.page);
    return this;
  }

  get alive() {
    return Boolean(this.win && !this.win.isDestroyed());
  }

  get webContents() {
    return this.alive ? this.win.webContents : null;
  }

  /** @param {{ view?: 'history' | 'settings' | 'usage' }} [opts] */
  show({ view = 'history' } = {}) {
    if (!this.alive) return;
    const cursor = screen.getCursorScreenPoint();
    const { workArea } = screen.getDisplayNearestPoint(cursor);
    const { x, y } = placeNear(cursor, workArea, POPUP_SIZE);
    this.win.setPosition(x, y, false);
    if (isMac) app.focus({ steal: true });
    this.win.show();
    this.win.focus();
    this.send('window:shown', { view });
    this.emit('shown', view);
  }

  hide() {
    if (!this.alive || !this.win.isVisible()) return;
    this.win.hide();
    // On macOS, hiding the app hands focus back to the app you were using.
    if (isMac) app.hide();
  }

  /** Runs a dialog without the popup hiding itself when the dialog takes focus. */
  async withDialog(open) {
    this.dialogOpen = true;
    try {
      return await open();
    } finally {
      this.dialogOpen = false;
      if (this.alive && this.win.isVisible()) this.win.focus();
    }
  }

  toggle() {
    if (this.alive && this.win.isVisible() && this.win.isFocused()) this.hide();
    else this.show();
  }

  send(channel, payload) {
    if (this.alive) this.win.webContents.send(channel, payload);
  }
}

function themeBackground() {
  return nativeTheme.shouldUseDarkColors ? THEME_BACKGROUND.dark : THEME_BACKGROUND.light;
}
