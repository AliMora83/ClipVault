// Small display helpers shared by the main process and the renderer.

/** "CommandOrControl+Shift+V" → "⌘⇧V" on macOS, "Ctrl+Shift+V" elsewhere. */
export function prettyHotkey(accelerator, platform) {
  if (!accelerator) return '';
  const mac = platform === 'darwin';
  const names = {
    CommandOrControl: mac ? '⌘' : 'Ctrl',
    Command: '⌘',
    Control: mac ? '⌃' : 'Ctrl',
    Shift: mac ? '⇧' : 'Shift',
    Alt: mac ? '⌥' : 'Alt',
  };
  return accelerator
    .split('+')
    .map((part) => names[part] ?? part)
    .join(mac ? '' : '+');
}

/** Collapse whitespace and cut to `max` characters with an ellipsis. */
export function preview(text, max) {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

/** Relative time for clip metadata. */
export function timeAgo(ts, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d < 7 ? `${d} d ago` : new Date(ts).toLocaleDateString();
}

/**
 * Clips to show for a tab and search query: pinned first, then most recent.
 * `history` is already newest-first.
 */
export function filterClips(history, { filter = 'all', query = '' } = {}) {
  const q = query.trim().toLowerCase();
  let items = filter === 'pinned' ? history.filter((c) => c.pinned) : history;
  if (q) items = items.filter((c) => c.text.toLowerCase().includes(q));
  return [...items.filter((c) => c.pinned), ...items.filter((c) => !c.pinned)];
}
