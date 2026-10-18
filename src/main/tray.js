// Menu bar / system tray icon and its menu of recent clips.

import { Menu, Tray, nativeImage } from 'electron';
import { isMac, paths, platform, TRAY_MENU_ITEMS } from './config.js';
import { prettyHotkey, preview } from '../shared/format.js';

export class TrayMenu {
  /**
   * @param {object} deps
   * @param {import('./store.js').Store} deps.store
   * @param {() => string | null} deps.currentHotkey
   * @param {() => void} deps.onOpen
   * @param {() => void} deps.onSettings
   * @param {(id: string) => void} deps.onSelect
   */
  constructor({ store, currentHotkey, onOpen, onSettings, onSelect }) {
    this.store = store;
    this.currentHotkey = currentHotkey;
    this.onOpen = onOpen;
    this.onSettings = onSettings;
    this.onSelect = onSelect;

    const icon = nativeImage.createFromPath(paths.trayIcon);
    if (isMac) icon.setTemplateImage(true); // macOS recolours it for light/dark menu bars
    this.tray = new Tray(icon);
    this.tray.on('click', () => {
      if (!isMac) onOpen(); // on macOS a click opens the menu instead
    });
    this.update();
  }

  update() {
    const { history, settings } = this.store;
    const hotkey = this.currentHotkey();

    const recent = history.slice(0, TRAY_MENU_ITEMS).map((clip, i) => ({
      label: `${clip.pinned ? '★ ' : ''}${preview(clip.text, 48)}`,
      accelerator: i < 9 ? `${i + 1}` : undefined,
      registerAccelerator: false,
      click: () => this.onSelect(clip.id),
    }));

    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open ClipVault', accelerator: hotkey ?? undefined, registerAccelerator: false, click: this.onOpen },
        { type: 'separator' },
        ...(recent.length ? recent : [{ label: 'No clips yet. Copy something.', enabled: false }]),
        { type: 'separator' },
        {
          label: 'Pause capture',
          type: 'checkbox',
          checked: settings.paused,
          click: (item) => this.store.updateSettings({ paused: item.checked }),
        },
        { label: 'Settings…', accelerator: 'CommandOrControl+,', registerAccelerator: false, click: this.onSettings },
        {
          label: 'Clear history (keep pinned)',
          enabled: history.some((h) => !h.pinned),
          click: () => this.store.clear({ keepPinned: true }),
        },
        { type: 'separator' },
        { label: 'Quit ClipVault', role: 'quit' },
      ]),
    );

    const count = `${history.length} clip${history.length === 1 ? '' : 's'}`;
    const lines = [`ClipVault: ${count}${settings.paused ? ' (paused)' : ''}`];
    if (hotkey) lines.push(`${prettyHotkey(hotkey, platform)} to open`);
    this.tray.setToolTip(lines.join('\n'));
  }

  destroy() {
    this.tray.destroy();
  }
}
