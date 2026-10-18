# Changelog

## 0.3.0

- **Usage stats**, counted on your computer only: clips used, pasted, captured, popup opens and clips found by search. Clip text is never part of the stats.
- **Usage screen** (Settings → View usage, or the menu bar): this month's totals, last month for comparison, a daily chart with hover details, CSV export and reset.
- **Monthly summary notification** on the first day of each month.
- "This month: N clips used" in the menu bar menu.
- **Track usage** switch in Settings.

## 0.2.0

- Paste with a native keystroke on macOS and Windows, like FlyCut. macOS now needs only the Accessibility permission.
- Clear message with an **Open Settings** button when a paste permission is missing.
- Settings item in the menu bar / tray menu.
- Main process split into focused modules; every message from the popup is validated.
- Unit tests for capture, storage, validation and display logic; an end-to-end smoke test that drives the real app.
- ESLint, Prettier, GitHub Actions CI and tag-triggered release builds.

## 0.1.0

- Background clipboard capture, tray menu, global shortcut popup.
- Search, pin, delete, history limit, skip duplicates and blank clips.
- Skips clips that password managers mark as concealed.
- "Carbon copy" light and dark design and app icon.
